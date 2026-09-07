package com.fairshare.debt_settlement;

import com.fairshare.debt_settlement.model.Person;
import com.fairshare.debt_settlement.repository.PersonRepository;
import com.fairshare.debt_settlement.security.JwtService;
import com.fairshare.debt_settlement.security.OAuth2LoginSuccessHandler;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Covers the crash a client hit: deactivate the account, then sign in again with the same Google
 * account and the app dies on the dashboard.
 *
 * The handler issued a perfectly valid JWT for a deactivated person, but UserDetailsService filters
 * on isActive(), so every request made with that token 401'd. The app stored the token, navigated to
 * Main, fired its startup fetch, got a wall of 401s and force-logged-out in a loop. Signing in is
 * how an account comes back, so the handler reactivates instead.
 */
class OAuth2LoginSuccessHandlerTest {

    private PersonRepository personRepository;
    private JwtService jwtService;
    private OAuth2LoginSuccessHandler handler;

    private HttpServletRequest request;
    private HttpServletResponse response;
    private Authentication authentication;

    @BeforeEach
    void setup() {
        personRepository = mock(PersonRepository.class);
        jwtService = mock(JwtService.class);
        when(jwtService.generateToken(anyString())).thenReturn("a.jwt.token");
        when(personRepository.save(any(Person.class))).thenAnswer(inv -> inv.getArgument(0));

        handler = new OAuth2LoginSuccessHandler(jwtService, personRepository);
        ReflectionTestUtils.setField(handler, "frontendRedirectUri", "cleardues://--/login-success");

        OAuth2User principal = mock(OAuth2User.class);
        when(principal.getAttribute("email")).thenReturn("krishna@example.com");
        when(principal.getAttribute("name")).thenReturn("Krishna");
        when(principal.getAttribute("picture")).thenReturn("https://pics/krishna.jpg");

        authentication = mock(Authentication.class);
        when(authentication.getPrincipal()).thenReturn(principal);

        request = mock(HttpServletRequest.class);
        response = mock(HttpServletResponse.class);
    }

    private Person existing(boolean active) {
        Person p = new Person();
        p.setId(1L);
        p.setEmail("krishna@example.com");
        p.setName("Krishna");
        p.setPictureUrl("https://pics/krishna.jpg");
        p.setActive(active);
        return p;
    }

    @Test
    void signingInReactivatesADeactivatedAccount() throws Exception {
        Person deactivated = existing(false);
        when(personRepository.findByEmail("krishna@example.com")).thenReturn(Optional.of(deactivated));

        handler.onAuthenticationSuccess(request, response, authentication);

        // Without this the token is still issued, but UserDetailsService rejects it on every
        // subsequent request - which is exactly what crashed the app.
        assertThat(deactivated.isActive()).isTrue();
        verify(personRepository).save(deactivated);
    }

    @Test
    void anAlreadyActiveAccountIsNotResaved() throws Exception {
        Person active = existing(true);
        when(personRepository.findByEmail("krishna@example.com")).thenReturn(Optional.of(active));

        handler.onAuthenticationSuccess(request, response, authentication);

        assertThat(active.isActive()).isTrue();
        // Picture is unchanged and the account is active, so there is nothing to write.
        verify(personRepository, never()).save(any(Person.class));
    }

    @Test
    void aBrandNewUserIsRegisteredAndActive() throws Exception {
        when(personRepository.findByEmail("krishna@example.com")).thenReturn(Optional.empty());

        handler.onAuthenticationSuccess(request, response, authentication);

        ArgumentCaptor<Person> saved = ArgumentCaptor.forClass(Person.class);
        verify(personRepository, atLeastOnce()).save(saved.capture());
        assertThat(saved.getValue().getEmail()).isEqualTo("krishna@example.com");
        assertThat(saved.getValue().isActive()).as("Person defaults to active").isTrue();
    }
}
