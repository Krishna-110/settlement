package com.fairshare.debt_settlement.service;

import com.vonage.client.VonageClient;
import com.vonage.client.sms.MessageStatus;
import com.vonage.client.sms.SmsSubmissionResponse;
import com.vonage.client.sms.messages.TextMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;


@Service
public class SmsService {

    @Value("${vonage.api.key}")
    private String apiKey;

    @Value("${vonage.api.secret}")
    private String apiSecret;

    @Value("${vonage.brand.name:Settlement}")
    private String brandName;

    @Value("${vonage.app.link:https://settleyourdues.com/}")
    private String appLink;

    private VonageClient client;

    @PostConstruct
    public void init() {
        if (apiKey != null && !apiKey.isEmpty() && !"your_api_key".equals(apiKey)) {
            client = VonageClient.builder().apiKey(apiKey).apiSecret(apiSecret).build();
        }
    }

    public void sendDebtNotification(String phoneNumber, String creditorName, double amount, boolean isRegistered, String debtorName) {
        if (client == null) {
            System.out.println("SmsService: Vonage client not initialized. Skipping SMS to " + phoneNumber);
            return;
        }

        String formattedPhone = formatPhoneNumber(phoneNumber);
        TextMessage message = new TextMessage(brandName, formattedPhone,
                buildMessage(creditorName, amount, isRegistered, debtorName));

        try {
            SmsSubmissionResponse response = client.getSmsClient().submitMessage(message);
            if (response.getMessages().get(0).getStatus() == MessageStatus.OK) {
                System.out.println("SMS sent successfully to " + formattedPhone);
            } else {
                System.err.println("SMS failed with status: " + response.getMessages().get(0).getErrorText());
            }
        } catch (Exception e) {
            System.err.println("Error sending SMS via Vonage: " + e.getMessage());
        }
    }

    /**
     * The text that actually goes out. Package-private so it can be asserted on without a live
     * Vonage client - see SmsServiceMessageTest.
     *
     * Two things to preserve when editing these strings:
     *
     * "Rs." not "₹". The rupee sign is outside the GSM-7 alphabet, so a single one flips the whole
     * message to UCS-2 encoding, where a segment holds 70 characters instead of 160. The old
     * registered message sat at 64 characters - one long name away from silently costing two
     * segments per send. Both strings below stay inside GSM-7 and fit one segment.
     *
     * The unregistered branch states the amount. It previously took `amount` and never used it,
     * so someone with no account was told only that "a debt" existed - no figure to check the
     * claim against, and much less reason to install anything.
     */
    String buildMessage(String creditorName, double amount, boolean isRegistered, String debtorName) {
        String amt = fmtAmount(amount);
        String to = shortName(debtorName);
        String from = shortName(creditorName);
        if (isRegistered) {
            return String.format("Hi %s, %s has recorded Rs. %s you owe on Settlement app. Open the app to accept or decline.",
                    to, from, amt);
        }
        return String.format("Hi %s, %s has recorded Rs. %s you owe on Settlement app. Download the app to view and settle: %s",
                to, from, amt, appLink);
    }

    /**
     * First name only, capped. The template leaves ~45 characters for both names and the amount
     * before the message spills past 160 and costs a second segment; two full names with surnames
     * blow straight through that. A first name is what you'd say in a text anyway.
     */
    private String shortName(String name) {
        if (name == null || name.isBlank()) return "there";
        String first = name.trim().split("\\s+")[0];
        return first.length() > 16 ? first.substring(0, 16) : first;
    }

    /** 500.0 -> "500", 500.5 -> "500.5". Without this the SMS reads "Rs.500.0". */
    private String fmtAmount(double amount) {
        if (amount == Math.rint(amount)) return String.valueOf((long) amount);
        return String.valueOf(Math.round(amount * 100.0) / 100.0);
    }

    private String formatPhoneNumber(String phone) {
        if (phone == null) return null;
        String cleaned = phone.replaceAll("\\D", "");
        if (cleaned.length() == 10) {
            return "91" + cleaned; // Assume India if 10 digits
        }
        return cleaned;
    }
}
