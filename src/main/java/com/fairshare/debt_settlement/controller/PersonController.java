package com.fairshare.debt_settlement.controller;

import com.fairshare.debt_settlement.model.Person;
import com.fairshare.debt_settlement.service.PersonService;
import com.fairshare.debt_settlement.dto.CreatePersonRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController // Tells Spring this class handles web requests and returns JSON
@RequestMapping("/api/persons") // The base URL for all methods in this class
public class PersonController {

    private final PersonService personService;

    public PersonController(PersonService personService) {
        this.personService = personService;
    }

    // POST /api/persons - Add a new person
    @PostMapping
    public ResponseEntity<Person> addPerson(@RequestBody CreatePersonRequest request) {
        Person savedPerson = personService.addPerson(request);
        return ResponseEntity.ok(savedPerson);
    }

    // GET /api/persons - Get all people
    @GetMapping
    public ResponseEntity<List<Person>> getAllPersons() {
        return ResponseEntity.ok(personService.getAllPersons());
    }

    // DELETE /api/persons/{id} - Delete a person (and their debts via cascade)
    @DeleteMapping("/{id}")
    public ResponseEntity<String> deletePerson(@PathVariable Long id) {
        personService.deletePerson(id);
        return ResponseEntity.ok("Person deleted successfully");
    }

    // GET /api/persons/check?phone=...
    // Uses HashMap rather than Map.of: Map.of throws on a null value, so a person with no name
    // (or a null normalized phone) turned this endpoint into a 500.
    @GetMapping("/check")
    public ResponseEntity<java.util.Map<String, Object>> checkPersonExists(@RequestParam String phone) {
        java.util.Map<String, Object> result = new java.util.HashMap<>();
        String normalized = personService.normalizePhoneNumber(phone);

        if (normalized == null || normalized.isEmpty()) {
            result.put("exists", false);
            return ResponseEntity.ok(result);
        }

        personService.personRepository.findByPhoneNumber(normalized).ifPresentOrElse(
                p -> {
                    result.put("exists", true);
                    result.put("name", p.getName());
                },
                () -> result.put("exists", false));

        return ResponseEntity.ok(result);
    }

    // PUT /api/persons/me/phone
    @PutMapping("/me/phone")
    public ResponseEntity<Person> updateMyPhone(@RequestBody java.util.Map<String, String> body) {
        return ResponseEntity.ok(personService.updateMyPhone(body.get("phone")));
    }

    // PUT /api/persons/me - update name, phone, and privacy/notification preferences
    @PutMapping("/me")
    public ResponseEntity<Person> updateMyProfile(
            @RequestBody com.fairshare.debt_settlement.dto.UpdateProfileRequest request) {
        return ResponseEntity.ok(personService.updateMyProfile(
                request.getName(), request.getPhone(),
                request.getHidePhone(), request.getHideEmail(), request.getNotificationsEnabled()));
    }

    // POST /api/persons/me/deactivate - refused while any balance is still outstanding
    @PostMapping("/me/deactivate")
    public ResponseEntity<Person> deactivateMyAccount() {
        return ResponseEntity.ok(personService.deactivateAccount());
    }

    // POST /api/persons/check-contacts
    @PostMapping("/check-contacts")
    public ResponseEntity<List<java.util.Map<String, Object>>> checkBatchContacts(@RequestBody List<String> phoneNumbers) {
        return ResponseEntity.ok(personService.checkContacts(phoneNumbers));
    }

    // POST /api/persons/sync-batch
    @PostMapping("/sync-batch")
    public ResponseEntity<List<Person>> syncBatchContacts(@RequestBody List<CreatePersonRequest> contacts) {
        return ResponseEntity.ok(personService.syncContactsBatch(contacts));
    }
}