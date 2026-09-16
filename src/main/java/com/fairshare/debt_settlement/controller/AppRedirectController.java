package com.fairshare.debt_settlement.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

/**
 * Public dynamic redirect for the app download link.
 *
 * Keeps SMS and DLT templates static (pointing to /app or /download) while allowing the
 * actual destination (Play Store, Closed Testing, or APK) to be changed anytime via
 * the app.download.target-url environment variable without requiring DLT re-approval.
 */
@RestController
public class AppRedirectController {

    @Value("${app.download.target-url:https://play.google.com/store/apps/details?id=com.cleardues}")
    private String targetUrl;

    @GetMapping({"/app", "/download", "/r/app"})
    public ResponseEntity<Void> redirectToApp() {
        HttpHeaders headers = new HttpHeaders();
        headers.setLocation(URI.create(targetUrl));
        return new ResponseEntity<>(headers, HttpStatus.FOUND);
    }
}
