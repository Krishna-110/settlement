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

    @Value("${vonage.app.link:https://gaurav-tekkie.github.io/Settlement.github.io/}")
    private String appLink;

    private VonageClient client;

    @PostConstruct
    public void init() {
        if (apiKey != null && !apiKey.isEmpty() && !"your_api_key".equals(apiKey)) {
            client = VonageClient.builder().apiKey(apiKey).apiSecret(apiSecret).build();
        }
    }

    public void sendDebtNotification(String phoneNumber, String creditorName, String amount, boolean isRegistered, String debtorName) {
        if (client == null) {
            System.out.println("SmsService: Vonage client not initialized. Skipping SMS to " + phoneNumber);
            return;
        }

        String formattedPhone = formatPhoneNumber(phoneNumber);
        String messageText;

        if (isRegistered) {
            messageText = String.format("Hi %s, %s recorded a debt of ₹%s for you on Settlement.", debtorName, creditorName, amount);
        } else {
            messageText = String.format("Hi %s, %s has recorded a debt for you on Settlement. Download the app to manage your dues: %s", debtorName, creditorName, appLink);
        }

        TextMessage message = new TextMessage(brandName, formattedPhone, messageText);

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

    private String formatPhoneNumber(String phone) {
        if (phone == null) return null;
        String cleaned = phone.replaceAll("\\D", "");
        if (cleaned.length() == 10) {
            return "91" + cleaned; // Assume India if 10 digits
        }
        return cleaned;
    }
}
