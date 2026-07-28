package com.fairshare.debt_settlement.service;

import com.fairshare.debt_settlement.dto.CreateDebtRequest;
import com.fairshare.debt_settlement.model.Debt;
import com.fairshare.debt_settlement.model.Person;
import com.fairshare.debt_settlement.repository.DebtRepository;
import com.fairshare.debt_settlement.repository.GroupRepository;
import com.fairshare.debt_settlement.repository.PersonRepository;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@AllArgsConstructor
public class DebtService {
    private final PersonRepository personRepository;
    private final DebtRepository debtRepository;
    private final SmsService smsService;
    private final NotificationService notificationService;
    private final GroupRepository groupRepository;

    /**
     * Records a debt. A debt you record against SOMEONE ELSE starts UNCONFIRMED and must be
     * accepted by the debtor before it counts (so nobody can inject a fake debt into the
     * balances). A debt where YOU are the debtor - you're admitting your own debt - is
     * auto-confirmed (PENDING) and the ledger is simplified right away.
     */
    @org.springframework.transaction.annotation.Transactional
    public Debt createDebt(CreateDebtRequest request, String currentUserEmail) {
        Person debtor = resolvePerson(request.getDebtorId(), request.getDebtorPhone(), "Debtor");
        Person creditor = resolvePerson(request.getCreditorId(), request.getCreditorPhone(), "Creditor");

        // A user may only record a transaction they are part of (as debtor or creditor); you cannot
        // create a debt between two other people. The app UI also forces one side to be the logged-in
        // user, so this is defense-in-depth for direct API calls.
        boolean recorderIsParty =
                (debtor.getEmail() != null && debtor.getEmail().equalsIgnoreCase(currentUserEmail))
             || (creditor.getEmail() != null && creditor.getEmail().equalsIgnoreCase(currentUserEmail));
        if (currentUserEmail != null && !recorderIsParty) {
            throw new IllegalArgumentException("You can only record a transaction you are part of.");
        }

        Debt debt = new Debt();
        debt.setDebtor(debtor);
        debt.setCreditor(creditor);
        debt.setAmount(request.getAmount());
        debt.setNote(request.getNote());
        if (request.getGroupId() != null) {
            debt.setGroup(groupRepository.findById(request.getGroupId()).orElse(null));
        }

        boolean recordedByDebtor = currentUserEmail != null
                && debtor.getEmail() != null
                && debtor.getEmail().equalsIgnoreCase(currentUserEmail);

        if (recordedByDebtor) {
            // You're recording your own debt -> no confirmation needed.
            debt.setStatus("PENDING");
            Debt saved = debtRepository.save(debt);
            simplifyConnectedComponents(currentUserEmail);
            return saved;
        }

        // Proposed against someone else -> wait for them to accept; notify them (in-app + SMS).
        debt.setStatus("UNCONFIRMED");
        Debt saved = debtRepository.save(debt);
        notificationService.notify(debtor.getEmail(), "PROPOSED",
                creditor.getName() + " recorded a ₹" + fmt(saved.getAmount()) + " debt for you. Accept or decline.",
                saved.getId());
        notifyDebtor(saved);
        return saved;
    }

    // Backwards-compatible overload (treats it as recorded by neither party).
    @org.springframework.transaction.annotation.Transactional
    public Debt createDebt(CreateDebtRequest request) {
        return createDebt(request, null);
    }

    /**
     * The debtor accepts a proposed (UNCONFIRMED) debt, turning it into an active PENDING debt.
     * Only the debtor may accept. Once active, the ledger is simplified.
     */
    @org.springframework.transaction.annotation.Transactional
    public Debt acceptDebt(Long debtId, String userEmail) {
        Debt debt = debtRepository.findById(debtId)
                .orElseThrow(() -> new IllegalArgumentException("Debt not found"));

        if (debt.getDebtor() == null || debt.getDebtor().getEmail() == null
                || !debt.getDebtor().getEmail().equalsIgnoreCase(userEmail)) {
            throw new IllegalArgumentException("Unauthorized: You are not the debtor.");
        }
        if (!"UNCONFIRMED".equals(debt.getStatus())) {
            return debt; // already accepted/declined/settled - nothing to do
        }

        debt.setStatus("PENDING");
        debtRepository.save(debt);
        if (debt.getCreditor() != null) {
            notificationService.notify(debt.getCreditor().getEmail(), "ACCEPTED",
                    debt.getDebtor().getName() + " accepted your ₹" + fmt(debt.getAmount()) + " entry.",
                    debt.getId());
        }
        simplifyConnectedComponents(userEmail);
        return debt;
    }

    /**
     * The debtor declines a proposed (UNCONFIRMED) debt. The row is kept with status DECLINED so it
     * stays visible in both parties' history (instead of silently vanishing). The proposer is notified.
     * Only the debtor may decline.
     */
    @org.springframework.transaction.annotation.Transactional
    public Debt declineDebt(Long debtId, String userEmail) {
        Debt debt = debtRepository.findById(debtId)
                .orElseThrow(() -> new IllegalArgumentException("Debt not found"));

        if (debt.getDebtor() == null || debt.getDebtor().getEmail() == null
                || !debt.getDebtor().getEmail().equalsIgnoreCase(userEmail)) {
            throw new IllegalArgumentException("Unauthorized: You are not the debtor.");
        }
        if (!"UNCONFIRMED".equals(debt.getStatus())) {
            return debt; // only a pending proposal can be declined
        }

        debt.setStatus("DECLINED");
        debtRepository.save(debt);
        if (debt.getCreditor() != null) {
            notificationService.notify(debt.getCreditor().getEmail(), "DECLINED",
                    debt.getDebtor().getName() + " declined your ₹" + fmt(debt.getAmount()) + " entry.",
                    debt.getId());
        }
        return debt;
    }

    /**
     * Simplifies the whole pending ledger, one connected group of people at a time.
     *
     * For each group it computes the minimal set of "who pays whom" (greedy min-cash-flow)
     * and, if that differs from what's currently on the books, REWRITES it: the old debts are
     * marked SETTLED (so middlemen drop out and chains collapse) and the minimal direct debts
     * are created fresh. Groups that are already minimal are left untouched.
     *
     * Returns the ids of debts that were settled by this pass.
     */
    @org.springframework.transaction.annotation.Transactional
    public Set<Long> simplifyConnectedComponents() {
        return simplifyConnectedComponents(null);
    }

    @org.springframework.transaction.annotation.Transactional
    public Set<Long> simplifyConnectedComponents(String actorEmail) {
        List<Debt> pending = debtRepository.findAll().stream()
                .filter(d -> "PENDING".equals(d.getStatus()))
                .filter(d -> d.getDebtor() != null && d.getCreditor() != null)
                .filter(d -> d.getDebtor().getId() != null && d.getCreditor().getId() != null)
                .collect(Collectors.toList());
        if (pending.isEmpty()) return Collections.emptySet();

        // Group people (and their debts) into connected components.
        Map<Long, Long> parent = new HashMap<>();
        Map<Long, Person> personById = new HashMap<>();
        for (Debt d : pending) {
            union(parent, d.getDebtor().getId(), d.getCreditor().getId());
            personById.put(d.getDebtor().getId(), d.getDebtor());
            personById.put(d.getCreditor().getId(), d.getCreditor());
        }
        Map<Long, List<Debt>> byComponent = new HashMap<>();
        for (Debt d : pending) {
            byComponent.computeIfAbsent(find(parent, d.getDebtor().getId()), k -> new ArrayList<>()).add(d);
        }

        Set<Long> settledIds = new HashSet<>();
        LocalDateTime now = LocalDateTime.now();

        for (List<Debt> component : byComponent.values()) {
            Map<Long, Double> net = new HashMap<>();
            for (Debt d : component) {
                net.merge(d.getDebtor().getId(), -d.getAmount(), Double::sum);
                net.merge(d.getCreditor().getId(), d.getAmount(), Double::sum);
            }

            List<Transfer> optimized = minCashFlow(net);

            // Already in minimal form -> nothing to do (avoids needless churn / history noise).
            if (sameEdges(component, optimized)) continue;

            // Everyone in this group is affected by the re-route.
            Set<String> affectedEmails = new HashSet<>();
            for (Debt d : component) {
                if (d.getDebtor().getEmail() != null) affectedEmails.add(d.getDebtor().getEmail());
                if (d.getCreditor().getEmail() != null) affectedEmails.add(d.getCreditor().getEmail());
            }

            // Settle the old rows...
            for (Debt d : component) {
                d.setStatus("SETTLED");
                d.setSettledAt(now);
                debtRepository.save(d);
                settledIds.add(d.getId());
            }
            // ...and create the minimal direct debts.
            for (Transfer t : optimized) {
                Debt nd = new Debt();
                nd.setDebtor(personById.get(t.debtorId));
                nd.setCreditor(personById.get(t.creditorId));
                nd.setAmount(round(t.amount));
                nd.setNote("Simplified");
                debtRepository.save(nd);
            }

            // Notify each affected person (except whoever triggered this) that their balances moved.
            for (String email : affectedEmails) {
                if (actorEmail != null && actorEmail.equalsIgnoreCase(email)) continue;
                notificationService.notify(email, "REROUTED",
                        "Your balances were updated — some debts were simplified.", null);
            }
        }
        return settledIds;
    }

    // Greedy min-cash-flow: the fewest transfers that settle the given net balances.
    // Deterministic (ties broken by person id) so an already-minimal ledger stays stable.
    private List<Transfer> minCashFlow(Map<Long, Double> net) {
        PriorityQueue<Bal> debtors = new PriorityQueue<>((x, y) -> {
            int c = Double.compare(x.amount, y.amount); // most negative first
            return c != 0 ? c : Long.compare(x.id, y.id);
        });
        PriorityQueue<Bal> creditors = new PriorityQueue<>((x, y) -> {
            int c = Double.compare(y.amount, x.amount); // most positive first
            return c != 0 ? c : Long.compare(x.id, y.id);
        });

        for (Map.Entry<Long, Double> e : net.entrySet()) {
            if (Math.abs(e.getValue()) < 0.01) continue;
            if (e.getValue() < 0) {
                debtors.add(new Bal(e.getKey(), e.getValue()));
            } else {
                creditors.add(new Bal(e.getKey(), e.getValue()));
            }
        }

        List<Transfer> result = new ArrayList<>();
        while (!debtors.isEmpty() && !creditors.isEmpty()) {
            Bal d = debtors.poll();
            Bal c = creditors.poll();
            double amount = round(Math.min(-d.amount, c.amount));
            result.add(new Transfer(d.id, c.id, amount));
            d.amount += amount;
            c.amount -= amount;
            if (d.amount < -0.01) debtors.add(d);
            if (c.amount > 0.01) creditors.add(c);
        }
        return result;
    }

    // True when the existing debts already equal the optimized transfers (same edges & amounts).
    private boolean sameEdges(List<Debt> current, List<Transfer> optimized) {
        Map<String, Integer> a = new HashMap<>();
        for (Debt d : current) {
            a.merge(edgeKey(d.getDebtor().getId(), d.getCreditor().getId(), d.getAmount()), 1, Integer::sum);
        }
        Map<String, Integer> b = new HashMap<>();
        for (Transfer t : optimized) {
            b.merge(edgeKey(t.debtorId, t.creditorId, t.amount), 1, Integer::sum);
        }
        return a.equals(b);
    }

    private String edgeKey(Long debtorId, Long creditorId, double amount) {
        return debtorId + ">" + creditorId + ":" + Math.round(amount * 100.0);
    }

    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    // --- tiny union-find over person ids, used to find connected groups of people ---
    private Long find(Map<Long, Long> parent, Long x) {
        parent.putIfAbsent(x, x);
        Long root = x;
        while (!parent.get(root).equals(root)) {
            root = parent.get(root);
        }
        Long cur = x;
        while (!parent.get(cur).equals(root)) { // path compression
            Long next = parent.get(cur);
            parent.put(cur, root);
            cur = next;
        }
        return root;
    }

    private void union(Map<Long, Long> parent, Long a, Long b) {
        Long ra = find(parent, a);
        Long rb = find(parent, b);
        if (!ra.equals(rb)) {
            parent.put(ra, rb);
        }
    }

    private static class Transfer {
        final Long debtorId;
        final Long creditorId;
        final double amount;

        Transfer(Long debtorId, Long creditorId, double amount) {
            this.debtorId = debtorId;
            this.creditorId = creditorId;
            this.amount = amount;
        }
    }

    private static class Bal {
        final Long id;
        double amount;

        Bal(Long id, double amount) {
            this.id = id;
            this.amount = amount;
        }
    }

    // Sends the "you owe X" SMS to the debtor of a newly created, still-outstanding debt.
    private void notifyDebtor(Debt debt) {
        try {
            Person debtor = debt.getDebtor();
            if (debtor.getPhoneNumber() != null && !debtor.getPhoneNumber().isEmpty()) {
                boolean isRegistered = !debtor.getEmail().endsWith("@cleardues.local")
                        && !debtor.getEmail().endsWith("@fairshare.local");
                smsService.sendDebtNotification(
                        debtor.getPhoneNumber(),
                        debt.getCreditor().getName(),
                        String.valueOf(debt.getAmount()),
                        isRegistered,
                        debtor.getName()
                );
            }
        } catch (Exception e) {
            // Log error but don't fail the transaction
            System.err.println("Failed to send SMS notification: " + e.getMessage());
        }
    }

    /**
     * The caller's own transactions only. This endpoint previously returned every debt in the
     * system to every user (the client then filtered locally) - both a needless payload/scan and
     * an exposure of other people's records.
     */
    public List<Debt> getAllDebts(String userEmail) {
        if (userEmail == null) return debtRepository.findAll();
        return personRepository.findByEmail(userEmail)
                .map(p -> debtRepository.findAllTransactionsForUser(p.getId()))
                .orElseGet(java.util.List::of);
    }

    // Unscoped view, used internally (e.g. the settlement engine needs the global picture).
    public List<Debt> getAllDebts() {
        return debtRepository.findAll();
    }

    public Debt updateDebt(Long id, CreateDebtRequest request) {
        if (id == null) throw new IllegalArgumentException("ID must not be null");
        Debt debt = debtRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Debt record not found"));

        // Only an active (PENDING) transaction can be edited. Settled / declined / deleted rows are
        // historical and must stay immutable.
        if (!"PENDING".equals(debt.getStatus())) {
            throw new IllegalArgumentException("Only pending transactions can be edited.");
        }

        String debtorPhone = normalizePhone(request.getDebtorPhone());
        String creditorPhone = normalizePhone(request.getCreditorPhone());

        Person debtor = personRepository.findByPhoneNumber(debtorPhone)
                .orElseThrow(() -> new IllegalArgumentException("Debtor not found with phone: " + request.getDebtorPhone()));
        Person creditor = personRepository.findByPhoneNumber(creditorPhone)
                .orElseThrow(() -> new IllegalArgumentException("Creditor not found with phone: " + request.getCreditorPhone()));

        debt.setDebtor(debtor);
        debt.setCreditor(creditor);
        debt.setAmount(request.getAmount());

        return debtRepository.save(debt);
    }

    // Resolve a person by id when given (used when their phone is hidden), else by phone.
    private Person resolvePerson(Long id, String phone, String role) {
        if (id != null) {
            return personRepository.findById(id)
                    .orElseThrow(() -> new IllegalArgumentException(role + " not found with id: " + id));
        }
        String normalized = normalizePhone(phone);
        return personRepository.findByPhoneNumber(normalized)
                .orElseThrow(() -> new IllegalArgumentException(role + " not found with phone: " + phone));
    }

    private String normalizePhone(String phone) {
        if (phone == null || phone.isEmpty()) return null;
        String cleaned = phone.replaceAll("\\D", ""); // Remove non-digits
        if (cleaned.length() > 10 && (cleaned.startsWith("91"))) {
            return cleaned.substring(cleaned.length() - 10);
        }
        return cleaned;
    }

    /**
     * Soft-delete: the row is KEPT with status DELETED (plus who/when) so an accidental delete is
     * visible and recoverable, instead of silently wiping an obligation. Only a party may delete.
     * The other party is notified.
     */
    @org.springframework.transaction.annotation.Transactional
    public void deleteDebt(Long id, String userEmail) {
        if (id == null) throw new IllegalArgumentException("ID must not be null");
        Debt debt = debtRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Debt not found"));
        if (!isParty(debt, userEmail)) {
            throw new IllegalArgumentException("Unauthorized: you are not a party to this debt.");
        }
        if ("DELETED".equals(debt.getStatus())) return;

        debt.setStatus("DELETED");
        debt.setDeletedAt(LocalDateTime.now());
        debt.setDeletedBy(userEmail);
        debtRepository.save(debt);
        notifyOtherParty(debt, userEmail, "DELETED",
                " deleted a debt of ₹" + fmt(debt.getAmount()) + ".");
    }

    // Backwards-compatible overload.
    @org.springframework.transaction.annotation.Transactional
    public void deleteDebt(Long id) {
        deleteDebt(id, null);
    }

    /**
     * Restores a soft-deleted debt back to active (PENDING) and re-simplifies the ledger.
     * Only a party may restore.
     */
    @org.springframework.transaction.annotation.Transactional
    public Debt restoreDebt(Long id, String userEmail) {
        Debt debt = debtRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Debt not found"));
        if (!isParty(debt, userEmail)) {
            throw new IllegalArgumentException("Unauthorized: you are not a party to this debt.");
        }
        if (!"DELETED".equals(debt.getStatus())) return debt;

        debt.setStatus("PENDING");
        debt.setDeletedAt(null);
        debt.setDeletedBy(null);
        debtRepository.save(debt);
        notifyOtherParty(debt, userEmail, "RESTORED",
                " restored a debt of ₹" + fmt(debt.getAmount()) + ".");
        simplifyConnectedComponents(userEmail);
        return debt;
    }

    private boolean isParty(Debt debt, String userEmail) {
        if (userEmail == null) return false;
        Person d = debt.getDebtor();
        Person c = debt.getCreditor();
        return (d != null && d.getEmail() != null && d.getEmail().equalsIgnoreCase(userEmail))
            || (c != null && c.getEmail() != null && c.getEmail().equalsIgnoreCase(userEmail));
    }

    // Notifies whichever party did NOT perform the action.
    private void notifyOtherParty(Debt debt, String actorEmail, String type, String suffix) {
        Person d = debt.getDebtor();
        Person c = debt.getCreditor();
        String actorName = "Someone";
        Person other = null;
        if (d != null && d.getEmail() != null && d.getEmail().equalsIgnoreCase(actorEmail)) {
            actorName = d.getName();
            other = c;
        } else if (c != null && c.getEmail() != null && c.getEmail().equalsIgnoreCase(actorEmail)) {
            actorName = c.getName();
            other = d;
        }
        if (other != null && other.getEmail() != null) {
            notificationService.notify(other.getEmail(), type, actorName + suffix, debt.getId());
        }
    }

    // Formats an amount without a trailing ".0" for whole numbers.
    private String fmt(double amount) {
        if (amount == Math.rint(amount)) return String.valueOf((long) amount);
        return String.valueOf(Math.round(amount * 100.0) / 100.0);
    }

    public Double getTotalOwed(Long userId) {
        return debtRepository.getTotalOwedByUser(userId);
    }

    public Double getTotalReceivable(Long userId) {
        return debtRepository.getTotalOwedToUser(userId);
    }
}
