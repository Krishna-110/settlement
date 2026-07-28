package com.fairshare.debt_settlement.controller;

import com.fairshare.debt_settlement.dto.CreateDebtRequest;
import com.fairshare.debt_settlement.model.Debt;
import com.fairshare.debt_settlement.service.DebtService;
import lombok.AllArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/debts")
@AllArgsConstructor
public class DebtController {

    private final DebtService debtService;

    @PostMapping
    public ResponseEntity<Debt> createDebt(@RequestBody CreateDebtRequest request) {
        return ResponseEntity.ok(debtService.createDebt(request, currentUserEmail()));
    }

    @PostMapping("/{id}/accept")
    public ResponseEntity<Debt> acceptDebt(@PathVariable Long id) {
        return ResponseEntity.ok(debtService.acceptDebt(id, currentUserEmail()));
    }

    @PostMapping("/{id}/decline")
    public ResponseEntity<Debt> declineDebt(@PathVariable Long id) {
        return ResponseEntity.ok(debtService.declineDebt(id, currentUserEmail()));
    }

    @PostMapping("/{id}/restore")
    public ResponseEntity<Debt> restoreDebt(@PathVariable Long id) {
        return ResponseEntity.ok(debtService.restoreDebt(id, currentUserEmail()));
    }

    private String currentUserEmail() {
        Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (principal instanceof UserDetails) {
            return ((UserDetails) principal).getUsername();
        }
        return principal.toString();
    }

    @GetMapping
    public ResponseEntity<List<Debt>> getAllDebts() {
        return ResponseEntity.ok(debtService.getAllDebts(currentUserEmail()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Debt> updateDebt(@PathVariable Long id, @RequestBody CreateDebtRequest request) {
        return ResponseEntity.ok(debtService.updateDebt(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteDebt(@PathVariable Long id) {
        debtService.deleteDebt(id, currentUserEmail());
        return ResponseEntity.noContent().build();
    }
}