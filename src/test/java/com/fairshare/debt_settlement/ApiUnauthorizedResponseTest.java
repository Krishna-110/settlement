package com.fairshare.debt_settlement;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A request to /api/** without a usable token must come back as a bare 401.
 *
 * oauth2Login() installs a browser-style entry point, so before this was pinned down an expired or
 * rejected token on /api/profile 302'd to /oauth2/authorization/google and on to
 * accounts.google.com. The mobile client follows redirects, so it got HTTP 200 with ~885KB of
 * Google's sign-in HTML rather than a 401 - the 401 interceptor never fired, the HTML string was
 * stored where a list belonged, and the next .map() over it crashed the app.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ApiUnauthorizedResponseTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void unauthenticatedApiCallReturns401AndNotARedirect() throws Exception {
        mockMvc.perform(get("/api/profile"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("Location"));
    }

    @Test
    void anExpiredOrGarbageTokenAlsoReturns401() throws Exception {
        mockMvc.perform(get("/api/persons").header("Authorization", "Bearer not.a.real.token"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("Location"));
    }

    @Test
    void browserOauthLoginStillRedirectsToGoogle() throws Exception {
        // The fix must not disturb the actual sign-in flow.
        mockMvc.perform(get("/oauth2/authorization/google"))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Location",
                        org.hamcrest.Matchers.containsString("accounts.google.com")));
    }
}
