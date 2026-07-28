package com.fairshare.debt_settlement;

import com.fairshare.debt_settlement.dto.CreateDebtRequest;
import com.fairshare.debt_settlement.model.Debt;
import com.fairshare.debt_settlement.model.Person;
import com.fairshare.debt_settlement.repository.DebtRepository;
import com.fairshare.debt_settlement.repository.GroupRepository;
import com.fairshare.debt_settlement.repository.PersonRepository;
import com.fairshare.debt_settlement.service.DebtService;
import com.fairshare.debt_settlement.service.NotificationService;
import com.fairshare.debt_settlement.service.SmsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Tests for recording debts, the propose/accept confirmation flow, and the automatic
 * ledger simplification that runs once a debt is active (PENDING).
 *
 * A stateful in-memory repo stands in for the database.
 * "X paid Y <amount>" is recorded as who-paid=X (creditor), who-owes=Y (debtor).
 */
class DebtServiceSettlementTest {

    private PersonRepository personRepository;
    private DebtRepository debtRepository;
    private SmsService smsService;
    private NotificationService notificationService;
    private GroupRepository groupRepository;
    private DebtService debtService;

    private List<Debt> db;
    private long nextId;

    private Person a; // 1111111111 / a@example.com
    private Person b; // 2222222222 / b@example.com
    private Person c; // 3333333333 / c@example.com

    @BeforeEach
    void setup() {
        personRepository = mock(PersonRepository.class);
        debtRepository = mock(DebtRepository.class);
        smsService = mock(SmsService.class);
        notificationService = mock(NotificationService.class);
        groupRepository = mock(GroupRepository.class);
        debtService = new DebtService(personRepository, debtRepository, smsService, notificationService, groupRepository);

        a = person(1L, "A", "1111111111");
        b = person(2L, "B", "2222222222");
        c = person(3L, "C", "3333333333");

        when(personRepository.findByPhoneNumber("1111111111")).thenReturn(Optional.of(a));
        when(personRepository.findByPhoneNumber("2222222222")).thenReturn(Optional.of(b));
        when(personRepository.findByPhoneNumber("3333333333")).thenReturn(Optional.of(c));

        db = new ArrayList<>();
        nextId = 1000L;
        when(debtRepository.save(any(Debt.class))).thenAnswer(inv -> {
            Debt d = inv.getArgument(0);
            if (d.getId() == null) {
                d.setId(nextId++);
                db.add(d);
            }
            return d;
        });
        when(debtRepository.findAll()).thenAnswer(inv -> new ArrayList<>(db));
        when(debtRepository.findById(any())).thenAnswer(inv -> {
            Long id = inv.getArgument(0);
            return db.stream().filter(d -> id.equals(d.getId())).findFirst();
        });
    }

    private Person person(Long id, String name, String phone) {
        Person p = new Person();
        p.setId(id);
        p.setName(name);
        p.setPhoneNumber(phone);
        p.setEmail(name.toLowerCase() + "@example.com");
        return p;
    }

    private Debt seedPending(Long id, Person debtor, Person creditor, double amount) {
        Debt d = new Debt();
        d.setId(id);
        d.setDebtor(debtor);
        d.setCreditor(creditor);
        d.setAmount(amount);
        d.setStatus("PENDING");
        db.add(d);
        return d;
    }

    private CreateDebtRequest req(String debtorPhone, String creditorPhone, double amount) {
        CreateDebtRequest r = new CreateDebtRequest();
        r.setDebtorPhone(debtorPhone);
        r.setCreditorPhone(creditorPhone);
        r.setAmount(amount);
        r.setNote("test");
        return r;
    }

    private List<Debt> pending() {
        return db.stream().filter(d -> "PENDING".equals(d.getStatus())).collect(Collectors.toList());
    }

    // ---- propose / accept confirmation flow ----

    @Test
    void proposingAgainstAnother_isUnconfirmedInactiveAndNotifiesDebtor() {
        // A records "B owes A 500" (A is the creditor, not the debtor).
        Debt result = debtService.createDebt(req("2222222222", "1111111111", 500.0), "a@example.com");

        assertThat(result.getStatus()).isEqualTo("UNCONFIRMED");
        assertThat(pending()).isEmpty(); // does not count until accepted
        verify(smsService, times(1)).sendDebtNotification(eq("2222222222"), eq("A"), anyString(), anyBoolean(), eq("B"));
    }

    @Test
    void debtorAccepting_makesItPendingAndActive() {
        Debt proposed = debtService.createDebt(req("2222222222", "1111111111", 500.0), "a@example.com");

        debtService.acceptDebt(proposed.getId(), "b@example.com");

        assertThat(proposed.getStatus()).isEqualTo("PENDING");
        assertThat(pending()).hasSize(1);
    }

    @Test
    void acceptingByNonDebtor_isRejected() {
        Debt proposed = debtService.createDebt(req("2222222222", "1111111111", 500.0), "a@example.com");

        assertThatThrownBy(() -> debtService.acceptDebt(proposed.getId(), "a@example.com"))
                .isInstanceOf(RuntimeException.class);
        assertThat(proposed.getStatus()).isEqualTo("UNCONFIRMED");
    }

    @Test
    void recordingYourOwnDebt_autoConfirmsWithoutSms() {
        // B records "B owes A 500" - admitting their own debt.
        Debt result = debtService.createDebt(req("2222222222", "1111111111", 500.0), "b@example.com");

        assertThat(result.getStatus()).isEqualTo("PENDING");
        assertThat(pending()).hasSize(1);
        verify(smsService, never()).sendDebtNotification(anyString(), anyString(), anyString(), anyBoolean(), anyString());
    }

    @Test
    void editingASettledDebt_isRejected() {
        Debt settled = seedPending(100L, a, b, 500.0);
        settled.setStatus("SETTLED");

        assertThatThrownBy(() ->
                debtService.updateDebt(100L, req("1111111111", "2222222222", 999.0)))
                .isInstanceOf(RuntimeException.class);

        assertThat(settled.getAmount()).isEqualTo(500.0); // unchanged
    }

    @Test
    void recordingBetweenTwoOthers_isRejected() {
        // C tries to record "A owes B 500" - C is neither the debtor nor the creditor.
        assertThatThrownBy(() ->
                debtService.createDebt(req("1111111111", "2222222222", 500.0), "c@example.com"))
                .isInstanceOf(RuntimeException.class);

        // Nothing was persisted.
        assertThat(db).isEmpty();
    }

    // ---- simplification math (recorded by the debtor -> auto-confirmed -> simplified) ----

    @Test
    void exactRepayment_squaresThePairWithNoLeftover() {
        seedPending(100L, a, b, 500.0); // A owes B 500
        debtService.createDebt(req("2222222222", "1111111111", 500.0), "b@example.com"); // B owes A 500

        assertThat(pending()).isEmpty();
    }

    @Test
    void partialRepayment_leavesReducedNetOwedToCreditor() {
        seedPending(100L, a, b, 500.0);
        debtService.createDebt(req("2222222222", "1111111111", 300.0), "b@example.com");

        List<Debt> remaining = pending();
        assertThat(remaining).hasSize(1);
        assertThat(remaining.get(0).getDebtor()).isEqualTo(a);
        assertThat(remaining.get(0).getCreditor()).isEqualTo(b);
        assertThat(remaining.get(0).getAmount()).isEqualTo(200.0);
    }

    @Test
    void overpayment_flipsTheBalanceToTheOtherPerson() {
        seedPending(100L, a, b, 500.0);
        debtService.createDebt(req("2222222222", "1111111111", 700.0), "b@example.com");

        List<Debt> remaining = pending();
        assertThat(remaining).hasSize(1);
        assertThat(remaining.get(0).getDebtor()).isEqualTo(b);
        assertThat(remaining.get(0).getCreditor()).isEqualTo(a);
        assertThat(remaining.get(0).getAmount()).isEqualTo(200.0);
    }

    @Test
    void chainCollapses_middlemanIsSettledAndDirectDebtCreated() {
        seedPending(100L, b, a, 500.0); // B owes A 500
        debtService.createDebt(req("3333333333", "2222222222", 500.0), "c@example.com"); // C owes B 500

        List<Debt> remaining = pending();
        assertThat(remaining).hasSize(1);
        assertThat(remaining.get(0).getDebtor()).isEqualTo(c);
        assertThat(remaining.get(0).getCreditor()).isEqualTo(a);
        assertThat(remaining.get(0).getAmount()).isEqualTo(500.0);
        // both original chain debts are settled (B drops out)
        assertThat(db.stream().filter(d -> "SETTLED".equals(d.getStatus()))).hasSize(2);
    }

    @Test
    void payingTheSimplifiedDebt_settlesEverything() {
        seedPending(100L, c, a, 500.0); // C owes A 500
        debtService.createDebt(req("1111111111", "3333333333", 500.0), "a@example.com"); // A owes C 500

        assertThat(pending()).isEmpty();
        assertThat(db).allMatch(d -> "SETTLED".equals(d.getStatus()));
    }

    // ---- debt listing is scoped to the caller ----

    @Test
    void getAllDebts_returnsOnlyTheCallersOwnTransactions() {
        when(personRepository.findByEmail("a@example.com")).thenReturn(Optional.of(a));
        Debt mine = seedPending(300L, a, b, 100.0);
        when(debtRepository.findAllTransactionsForUser(1L)).thenReturn(List.of(mine));

        List<Debt> result = debtService.getAllDebts("a@example.com");

        assertThat(result).containsExactly(mine);
        // Must never fall back to handing out every debt in the system.
        verify(debtRepository, never()).findAll();
    }

    // ---- decline ----

    @Test
    void decliningKeepsADeclinedRecordAndNotifiesCreditor() {
        Debt proposed = debtService.createDebt(req("2222222222", "1111111111", 500.0), "a@example.com");

        debtService.declineDebt(proposed.getId(), "b@example.com");

        assertThat(proposed.getStatus()).isEqualTo("DECLINED");
        assertThat(db).contains(proposed);   // row kept for history
        assertThat(pending()).isEmpty();      // never counts toward balances
        verify(notificationService).notify(eq("a@example.com"), eq("DECLINED"), anyString(), any());
    }

    @Test
    void decliningByNonDebtor_isRejected() {
        Debt proposed = debtService.createDebt(req("2222222222", "1111111111", 500.0), "a@example.com");

        assertThatThrownBy(() -> debtService.declineDebt(proposed.getId(), "a@example.com"))
                .isInstanceOf(RuntimeException.class);
        assertThat(proposed.getStatus()).isEqualTo("UNCONFIRMED");
    }

    // ---- soft delete / restore ----

    @Test
    void deletingIsSoftAndKeepsTheRowOutOfBalances() {
        Debt d = seedPending(100L, a, b, 500.0); // A owes B 500

        debtService.deleteDebt(100L, "a@example.com");

        assertThat(d.getStatus()).isEqualTo("DELETED");
        assertThat(d.getDeletedBy()).isEqualTo("a@example.com");
        assertThat(d.getDeletedAt()).isNotNull();
        assertThat(db).contains(d);       // row kept, recoverable
        assertThat(pending()).isEmpty();  // ignored by balances
    }

    @Test
    void deletingByNonParty_isRejected() {
        seedPending(100L, a, b, 500.0);

        assertThatThrownBy(() -> debtService.deleteDebt(100L, "c@example.com"))
                .isInstanceOf(RuntimeException.class);
        assertThat(pending()).hasSize(1);
    }

    @Test
    void restoringADeletedDebt_makesItActiveAgain() {
        Debt d = seedPending(100L, a, b, 500.0);
        debtService.deleteDebt(100L, "a@example.com");

        debtService.restoreDebt(100L, "a@example.com");

        assertThat(d.getStatus()).isEqualTo("PENDING");
        assertThat(d.getDeletedAt()).isNull();
        assertThat(pending()).hasSize(1);
    }

    // ---- notifications ----

    @Test
    void accepting_notifiesTheCreditor() {
        Debt proposed = debtService.createDebt(req("2222222222", "1111111111", 500.0), "a@example.com");

        debtService.acceptDebt(proposed.getId(), "b@example.com");

        verify(notificationService).notify(eq("a@example.com"), eq("ACCEPTED"), anyString(), any());
    }

    @Test
    void chainReroute_notifiesAffectedPartiesExceptTheActor() {
        seedPending(100L, b, a, 500.0); // B owes A 500
        debtService.createDebt(req("3333333333", "2222222222", 500.0), "c@example.com"); // C owes B 500 (actor = C)

        verify(notificationService).notify(eq("a@example.com"), eq("REROUTED"), anyString(), any());
        verify(notificationService).notify(eq("b@example.com"), eq("REROUTED"), anyString(), any());
        verify(notificationService, never()).notify(eq("c@example.com"), eq("REROUTED"), anyString(), any());
    }
}
