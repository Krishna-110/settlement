package com.fairshare.debt_settlement.service;

import com.fairshare.debt_settlement.dto.CreatePersonRequest;
import com.fairshare.debt_settlement.model.Person;
import com.fairshare.debt_settlement.model.Debt;
import com.fairshare.debt_settlement.model.Group;
import com.fairshare.debt_settlement.repository.DebtRepository;
import com.fairshare.debt_settlement.repository.GroupRepository;
import com.fairshare.debt_settlement.repository.PersonRepository;
import lombok.AllArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
@AllArgsConstructor
public class PersonService {

    public final PersonRepository personRepository;
    public final DebtRepository debtRepository;
    public final GroupRepository groupRepository;

    private Person getCurrentUser() {
        Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        String email;
        if (principal instanceof UserDetails) {
            email = ((UserDetails) principal).getUsername();
        } else {
            email = principal.toString();
        }
        return personRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("User profile not found in database"));
    }

    @org.springframework.transaction.annotation.Transactional
    public Person addPerson(CreatePersonRequest request) {
        Person currentUser = getCurrentUser();
        Person friendToAdd;

        String normalizedPhone = normalizePhoneNumber(request.getPhoneNumber());

        if (normalizedPhone != null && !normalizedPhone.isEmpty()) {
            Optional<Person> existingPerson = personRepository.findByPhoneNumber(normalizedPhone);
            if (existingPerson.isPresent()) {
                friendToAdd = existingPerson.get();
            } else {
                friendToAdd = new Person();
                friendToAdd.setName(request.getName().trim());
                friendToAdd.setPhoneNumber(normalizedPhone);
                // Assign a temporary email since it is required and unique
                friendToAdd.setEmail("phone_" + normalizedPhone + "@cleardues.local");
                friendToAdd = personRepository.save(friendToAdd);
                personRepository.flush(); // Ensure ID is generated for friendship link
            }
        } else if (request.getEmail() != null && !request.getEmail().trim().isEmpty()) {
            Optional<Person> existingPerson = personRepository.findByEmail(request.getEmail().trim());
            if (existingPerson.isPresent()) {
                friendToAdd = existingPerson.get();
            } else {
                // Create placeholder person with real email
                friendToAdd = new Person();
                friendToAdd.setName(request.getName().trim());
                friendToAdd.setEmail(request.getEmail().trim());
                friendToAdd = personRepository.save(friendToAdd);
                personRepository.flush();
            }
        } else {
            // Unregistered proxy person
            friendToAdd = new Person();
            friendToAdd.setName(request.getName().trim());
            friendToAdd.setEmail("offline_" + java.util.UUID.randomUUID().toString() + "@cleardues.local");
            friendToAdd = personRepository.save(friendToAdd);
            personRepository.flush();
        }

        establishMutualFriendship(currentUser, friendToAdd);
        return friendToAdd;
    }

    /**
     * Auto-befriends every contact in the batch that is already registered. Unregistered numbers are
     * skipped (no placeholder is created).
     *
     * Performance: this used to run one findByPhoneNumber per contact AND touch each friend's lazy
     * getFriends() collection, i.e. ~2 queries per contact. It now does a single batched lookup and
     * a single bulk insert for the reverse direction, regardless of batch size.
     */
    @org.springframework.transaction.annotation.Transactional
    public List<Person> syncContactsBatch(List<CreatePersonRequest> contacts) {
        Person currentUser = getCurrentUser();

        // Normalize + dedupe once, then resolve every number in ONE query.
        List<String> normalizedNumbers = contacts.stream()
                .map(c -> normalizePhoneNumber(c.getPhoneNumber()))
                .filter(p -> p != null && !p.isEmpty())
                .distinct()
                .collect(java.util.stream.Collectors.toList());

        if (normalizedNumbers.isEmpty()) return getAllPersons();

        List<Person> registered = personRepository.findAllByPhoneNumberIn(normalizedNumbers);

        // Only the current user's own collection is touched, so no per-contact lazy load happens.
        java.util.Set<Long> friendIds = currentUser.getFriends().stream()
                .map(Person::getId)
                .collect(java.util.stream.Collectors.toCollection(java.util.HashSet::new));

        List<Long> newFriendIds = new ArrayList<>();
        for (Person candidate : registered) {
            if (candidate.getId() == null || candidate.getId().equals(currentUser.getId())) continue;
            if (!friendIds.add(candidate.getId())) continue; // already a friend
            currentUser.getFriends().add(candidate);
            newFriendIds.add(candidate.getId());
        }

        if (!newFriendIds.isEmpty()) {
            personRepository.save(currentUser);
            personRepository.flush(); // persist this side before the bulk mirror insert
            personRepository.addReverseFriendships(currentUser.getId(), newFriendIds);
        }

        return getAllPersons();
    }

    private void establishMutualFriendship(Person a, Person b) {
        // Both must already be persisted (non-null id): Person's equals/hashCode is id-based, so
        // adding a not-yet-saved entity into a HashSet<Person> (friends) would silently misbehave.
        java.util.Objects.requireNonNull(a.getId(), "person a must be persisted before befriending");
        java.util.Objects.requireNonNull(b.getId(), "person b must be persisted before befriending");
        if (a.getId().equals(b.getId())) return;
        
        boolean alreadyFriends = a.getFriends().stream()
                .anyMatch(f -> f.getId().equals(b.getId()));
        
        if (!alreadyFriends) {
            a.getFriends().add(b);
            b.getFriends().add(a);
            // Relationship is @ManyToMany, saving either one updates the join table
        }
    }

    public List<java.util.Map<String, Object>> checkContacts(List<String> phoneNumbers) {
        List<String> normalizedNumbers = phoneNumbers.stream()
                .map(this::normalizePhoneNumber)
                .filter(n -> n != null && !n.isEmpty())
                .collect(java.util.stream.Collectors.toList());

        List<Person> foundPersons = personRepository.findAllByPhoneNumberIn(normalizedNumbers);
        java.util.Map<String, Person> phoneToPerson = foundPersons.stream()
                .collect(java.util.stream.Collectors.toMap(Person::getPhoneNumber, p -> p));

        List<java.util.Map<String, Object>> results = new ArrayList<>();
        for (String original : phoneNumbers) {
            String normalized = normalizePhoneNumber(original);
            Person p = phoneToPerson.get(normalized);
            
            java.util.Map<String, Object> map = new java.util.HashMap<>();
            map.put("original", original);
            map.put("normalized", normalized);
            map.put("registered", p != null);
            if (p != null) {
                map.put("name", p.getName());
            }
            results.add(map);
        }
        return results;
    }

    public String normalizePhoneNumber(String phone) {
        if (phone == null || phone.isEmpty()) return null;
        String cleaned = phone.replaceAll("\\D", ""); // Remove non-digits
        if (cleaned.length() > 10 && (cleaned.startsWith("91"))) {
            return cleaned.substring(cleaned.length() - 10);
        }
        return cleaned;
    }

    @org.springframework.transaction.annotation.Transactional
    @SuppressWarnings("null")
    public Person updateMyPhone(String phone) {
        Person currentUser = getCurrentUser();
        String normalized = normalizePhoneNumber(phone);
        if (normalized == null || normalized.length() != 10) {
            throw new IllegalArgumentException("Invalid phone number format. Please enter 10 digits.");
        }

        // Check if there is another person with this phone number
        Optional<Person> existingPersonOpt = personRepository.findByPhoneNumber(normalized);
        if (existingPersonOpt.isPresent()) {
            Person existingPerson = existingPersonOpt.get();
            if (!existingPerson.getId().equals(currentUser.getId())) {
                // If the existing user is a placeholder/proxy, we merge them
                if (existingPerson.getEmail().endsWith("@cleardues.local")) {
                    
                    // 1. Migrate friendships
                    for (Person friend : new ArrayList<>(existingPerson.getFriends())) {
                        friend.getFriends().remove(existingPerson);
                        existingPerson.getFriends().remove(friend);
                        personRepository.save(friend);
                        
                        establishMutualFriendship(currentUser, friend);
                    }
                    
                    // 2. Migrate debts
                    List<Debt> debtorDebts = debtRepository.findByDebtorId(existingPerson.getId());
                    for (Debt debt : debtorDebts) {
                        debt.setDebtor(currentUser);
                    }
                    debtRepository.saveAll(debtorDebts);

                    List<Debt> creditorDebts = debtRepository.findByCreditorId(existingPerson.getId());
                    for (Debt debt : creditorDebts) {
                        debt.setCreditor(currentUser);
                    }
                    debtRepository.saveAll(creditorDebts);
                    
                    debtRepository.flush();

                    // 3. Delete the proxy person (group memberships/ownership first - Group has no
                    // cascade-delete on its Person references, so this must run before the delete
                    // or Postgres would reject it with a foreign-key violation)
                    reassignGroupMemberships(existingPerson, currentUser);
                    personRepository.removeAllFriendships(existingPerson.getId());
                    personRepository.delete(existingPerson);
                    personRepository.flush();
                } else {
                    throw new IllegalArgumentException("This phone number is already registered by another user.");
                }
            }
        }

        currentUser.setPhoneNumber(normalized);
        return personRepository.save(currentUser);
    }

    // Update the current user's own profile (name, phone, privacy + notification prefs).
    @org.springframework.transaction.annotation.Transactional
    public Person updateMyProfile(String name, String phone, Boolean hidePhone, Boolean hideEmail,
                                  Boolean notificationsEnabled) {
        Person me = getCurrentUser();
        if (name != null && !name.isBlank()) me.setName(name.trim());
        if (hidePhone != null) me.setHidePhone(hidePhone);
        if (hideEmail != null) me.setHideEmail(hideEmail);
        if (notificationsEnabled != null) me.setNotificationsEnabled(notificationsEnabled);
        if (phone != null && !phone.isBlank()) {
            String normalized = normalizePhoneNumber(phone);
            if (normalized != null && !normalized.equals(me.getPhoneNumber())) {
                updateMyPhone(phone); // reuse the robust phone-change/merge logic (same managed entity)
            }
        }
        return personRepository.save(me);
    }

    public List<Person> getAllPersons() {
        Person currentUser = getCurrentUser();
        // Exclude the current user themselves if they happen to be in the set
        List<Person> friends = new ArrayList<>(currentUser.getFriends());
        friends.removeIf(p -> p.getId().equals(currentUser.getId()));
        // Return masked COPIES so a friend's hidden phone/email is never exposed to others.
        // (Copies, not managed entities, so nothing is accidentally persisted.)
        List<Person> masked = new ArrayList<>();
        for (Person p : friends) masked.add(maskedCopy(p));
        // friends is a HashSet, so without this the order is arbitrary and changes between calls.
        masked.sort(java.util.Comparator.comparing(
                Person::getName, java.util.Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER)));
        return masked;
    }

    private Person maskedCopy(Person p) {
        Person copy = new Person();
        copy.setId(p.getId());
        copy.setName(p.getName());
        copy.setPictureUrl(p.getPictureUrl());
        copy.setEmail(p.isHideEmail() ? null : p.getEmail());
        copy.setPhoneNumber(p.isHidePhone() ? null : p.getPhoneNumber());
        return copy;
    }

    @org.springframework.transaction.annotation.Transactional
    public void deletePerson(Long friendId) {
        if (friendId == null) throw new IllegalArgumentException("Friend ID must not be null");
        Person currentUser = getCurrentUser();
        Person friendToDelete = personRepository.findById(friendId)
                .orElseThrow(() -> new IllegalArgumentException("Person not found"));

        // 1. Remove mutual friendship
        currentUser.getFriends().remove(friendToDelete);
        friendToDelete.getFriends().remove(currentUser);
        personRepository.save(currentUser);
        
        // 2. Delete mutual debts
        debtRepository.deleteMutualDebts(currentUser.getId(), friendToDelete.getId());

        // 3. If the user is an offline proxy user, we delete them entirely
        if (friendToDelete.getEmail().endsWith("@cleardues.local")) {
            reassignGroupMemberships(friendToDelete, currentUser);
            personRepository.removeAllFriendships(friendToDelete.getId());
            personRepository.delete(friendToDelete);
        } else {
            personRepository.save(friendToDelete);
        }
    }

    // Before deleting a placeholder person, hand off any group they belong to (or own) so
    // deleting them never violates a foreign-key constraint on Group.owner/Group.members.
    private void reassignGroupMemberships(Person placeholder, Person newOwner) {
        for (Group g : groupRepository.findByMembers_Id(placeholder.getId())) {
            g.getMembers().remove(placeholder);
            if (g.getOwner() != null && g.getOwner().getId().equals(placeholder.getId())) {
                g.setOwner(newOwner);
                g.getMembers().add(newOwner);
            }
            groupRepository.save(g);
        }
    }
}
