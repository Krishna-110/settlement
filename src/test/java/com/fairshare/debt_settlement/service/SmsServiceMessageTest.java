package com.fairshare.debt_settlement.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The debt SMS is the only thing someone without an account ever sees, so it has to carry the
 * figure, carry a link, and cost one segment.
 */
class SmsServiceMessageTest {

    /**
     * GSM 03.38 basic set plus the extension table. Anything outside this flips the whole message
     * to UCS-2, where a segment holds 70 characters instead of 160 - so one stray glyph can double
     * the per-message cost.
     */
    private static final String GSM7 =
            "@£$¥èéùìòÇ\nØø\rÅå"
            + "Δ_ΦΓΛΩΠΨΣΘΞÆæßÉ"
            + " !\"#¤%&'()*+,-./0123456789:;<=>?¡"
            + "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿"
            + "abcdefghijklmnopqrstuvwxyzäöñüà"
            + "^{}\\[~]|€";

    private SmsService sms;

    @BeforeEach
    void setup() {
        sms = new SmsService();
        ReflectionTestUtils.setField(sms, "appLink", "https://settleyourdues.com/");
    }

    private static String nonGsm7Chars(String s) {
        StringBuilder bad = new StringBuilder();
        for (char c : s.toCharArray()) {
            if (GSM7.indexOf(c) < 0 && bad.indexOf(String.valueOf(c)) < 0) bad.append(c);
        }
        return bad.toString();
    }

    @Test
    void theUnregisteredMessageStatesTheAmountAndLinksTheApp() {
        String msg = sms.buildMessage("Krishna", 500.0, false, "Priya");

        // It used to accept `amount` and never print it - "a debt" with no figure.
        assertThat(msg).contains("500");
        assertThat(msg).contains("https://settleyourdues.com/");
        assertThat(msg).contains("Priya").contains("Krishna");
    }

    @Test
    void theRegisteredMessageStatesTheAmountAndSkipsTheDownloadLink() {
        String msg = sms.buildMessage("Krishna", 500.0, true, "Priya");

        assertThat(msg).contains("500");
        assertThat(msg).doesNotContain("settleyourdues.com");
    }

    @Test
    void wholeAmountsDropTheTrailingZero() {
        // String.valueOf(500.0) is "500.0", which shipped as "Rs.500.0".
        assertThat(sms.buildMessage("K", 500.0, true, "P")).contains("Rs.500 ");
        assertThat(sms.buildMessage("K", 500.5, true, "P")).contains("Rs.500.5");
        assertThat(sms.buildMessage("K", 1234.567, true, "P")).contains("Rs.1234.57");
    }

    @Test
    void bothMessagesStayInsideGsm7AndOneSegment() {
        for (boolean registered : new boolean[]{true, false}) {
            // A generously long pair of names - real users will rarely exceed this.
            String msg = sms.buildMessage("Krishnamurthy Raghavan", 123456.75, registered,
                    "Priyadarshini Venkatesh");

            assertThat(nonGsm7Chars(msg))
                    .as("registered=%s must not force UCS-2 (this is what the rupee sign did)", registered)
                    .isEmpty();
            assertThat(msg.length())
                    .as("registered=%s must fit one GSM-7 segment", registered)
                    .isLessThanOrEqualTo(160);
        }
    }
}
