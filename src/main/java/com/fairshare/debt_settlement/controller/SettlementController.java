package com.fairshare.debt_settlement.controller;

import com.fairshare.debt_settlement.dto.SettlementResponse;
import com.fairshare.debt_settlement.service.SettlementService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/settle")
public class SettlementController {

    private final SettlementService settlementService;

    public SettlementController(SettlementService settlementService) {
        this.settlementService = settlementService;
    }

    // Read-only: returns the optimized "who should pay whom" suggestions.
    // Settlement is now done manually by recording the repayment in the app.
    @GetMapping
    public ResponseEntity<List<SettlementResponse>> settle() {
        return ResponseEntity.ok(settlementService.settleDebts());
    }
}
