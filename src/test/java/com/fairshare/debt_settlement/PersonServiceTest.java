package com.fairshare.debt_settlement;

import com.fairshare.debt_settlement.model.Group;
import com.fairshare.debt_settlement.model.Person;
import com.fairshare.debt_settlement.repository.DebtRepository;
import com.fairshare.debt_settlement.repository.GroupRepository;
import com.fairshare.debt_settlement.repository.PersonRepository;
import com.fairshare.debt_settlement.service.PersonService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Covers the real bug behind the "Complete Your Profile" 500: PersonService.updateMyPhone was
 * throwing plain RuntimeException for ordinary validation failures (invalid format, phone already
 * claimed), which GlobalExceptionHandler's catch-all turns into a generic 500 instead of a 400 with
 * a real message. These now throw IllegalArgumentException. Also covers the Group-membership
 * cascade fix: a placeholder person can never be safely deleted while still referenced by a Group.
 */
class PersonServiceTest {

    private PersonRepository personRepository;
    private DebtRepository debtRepository;
    private GroupRepository groupRepository;
    private PersonService personService;

    private Person me;

    @BeforeEach
    void setup() {
        personRepository = mock(PersonRepository.class);
        debtRepository = mock(DebtRepository.class);
        groupRepository = mock(GroupRepository.class);
        personService = new PersonService(personRepository, debtRepository, groupRepository);

        me = person(1L, "Me", "me@example.com", null);
        when(personRepository.findByEmail("me@example.com")).thenReturn(Optional.of(me));
        when(personRepository.save(any(Person.class))).thenAnswer(inv -> inv.getArgument(0));
        signInAs("me@example.com");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void signInAs(String email) {
        Authentication auth = mock(Authentication.class);
        when(auth.getPrincipal()).thenReturn(new User(email, "N/A", Collections.emptyList()));
        SecurityContext context = mock(SecurityContext.class);
        when(context.getAuthentication()).thenReturn(auth);
        SecurityContextHolder.setContext(context);
    }

    private Person person(Long id, String name, String email, String phone) {
        Person p = new Person();
        p.setId(id);
        p.setName(name);
        p.setEmail(email);
        p.setPhoneNumber(phone);
        return p;
    }

    private com.fairshare.debt_settlement.dto.CreatePersonRequest contact(String phone) {
        com.fairshare.debt_settlement.dto.CreatePersonRequest r =
                new com.fairshare.debt_settlement.dto.CreatePersonRequest();
        r.setPhoneNumber(phone);
        r.setName("Contact " + phone);
        return r;
    }

    @Test
    void syncContactsBatch_resolvesAllNumbersInOneQuery_notOnePerContact() {
        Person a = person(2L, "A", "a@example.com", "9000000001");
        Person b = person(3L, "B", "b@example.com", "9000000002");
        when(personRepository.findAllByPhoneNumberIn(any())).thenReturn(List.of(a, b));

        // 9000000003 isn't registered, and 9000000001 is repeated to prove de-duplication.
        personService.syncContactsBatch(List.of(
                contact("9000000001"), contact("9000000002"),
                contact("9000000003"), contact("9000000001")));

        // One batched lookup for the whole address book...
        verify(personRepository, times(1)).findAllByPhoneNumberIn(any());
        // ...and never the old per-contact query (that was the N+1).
        verify(personRepository, never()).findByPhoneNumber(anyString());
        // Both registered contacts are auto-befriended, mirrored in a single bulk statement.
        assertThat(me.getFriends()).contains(a, b);
        verify(personRepository, times(1)).addReverseFriendships(eq(1L), any());
    }

    @Test
    void syncContactsBatch_whenNobodyIsRegistered_writesNothing() {
        when(personRepository.findAllByPhoneNumberIn(any())).thenReturn(List.of());

        personService.syncContactsBatch(List.of(contact("9000000009")));

        assertThat(me.getFriends()).isEmpty();
        verify(personRepository, never()).addReverseFriendships(any(), any());
    }

    @Test
    void updateMyPhone_invalidFormat_throwsIllegalArgumentNotRuntimeException() {
        assertThatThrownBy(() -> personService.updateMyPhone("123"))
                .isExactlyInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void updateMyPhone_alreadyClaimedByARealUser_throwsIllegalArgument() {
        Person other = person(2L, "Other", "other@example.com", "9876543210");
        when(personRepository.findByPhoneNumber("9876543210")).thenReturn(Optional.of(other));

        assertThatThrownBy(() -> personService.updateMyPhone("9876543210"))
                .isExactlyInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("already registered");
    }

    @Test
    void updateMyPhone_claimedByAPlaceholder_mergesAndDeletesPlaceholder() {
        Person placeholder = person(3L, "Placeholder", "phone_9876543210@cleardues.local", "9876543210");
        when(personRepository.findByPhoneNumber("9876543210")).thenReturn(Optional.of(placeholder));
        when(debtRepository.findByDebtorId(3L)).thenReturn(new ArrayList<>());
        when(debtRepository.findByCreditorId(3L)).thenReturn(new ArrayList<>());
        when(groupRepository.findByMembers_Id(3L)).thenReturn(Collections.emptyList());

        Person result = personService.updateMyPhone("9876543210");

        assertThat(result.getPhoneNumber()).isEqualTo("9876543210");
        verify(personRepository).delete(placeholder);
        verify(personRepository).removeAllFriendships(3L);
    }

    @Test
    void updateMyPhone_placeholderOwnsAGroup_reassignsOwnershipBeforeDeleting() {
        Person placeholder = person(3L, "Placeholder", "phone_9876543210@cleardues.local", "9876543210");
        when(personRepository.findByPhoneNumber("9876543210")).thenReturn(Optional.of(placeholder));
        when(debtRepository.findByDebtorId(3L)).thenReturn(new ArrayList<>());
        when(debtRepository.findByCreditorId(3L)).thenReturn(new ArrayList<>());

        Group group = new Group();
        group.setId(10L);
        group.setOwner(placeholder);
        group.getMembers().add(placeholder);
        when(groupRepository.findByMembers_Id(3L)).thenReturn(List.of(group));

        personService.updateMyPhone("9876543210");

        // The placeholder is fully detached from the group (ownership reassigned, membership
        // removed) BEFORE personRepository.delete() runs - otherwise Postgres would reject the
        // delete with a foreign-key violation.
        assertThat(group.getOwner()).isEqualTo(me);
        assertThat(group.getMembers()).contains(me);
        assertThat(group.getMembers()).doesNotContain(placeholder);
        verify(groupRepository).save(group);
        verify(personRepository).delete(placeholder);
    }
}
