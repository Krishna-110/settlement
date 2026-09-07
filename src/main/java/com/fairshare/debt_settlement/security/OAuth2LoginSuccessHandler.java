package com.fairshare.debt_settlement.security;

import com.fairshare.debt_settlement.model.Person;
import com.fairshare.debt_settlement.repository.PersonRepository;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;

@Component // Extremely important: Tells Spring to create this Bean!
public class OAuth2LoginSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final JwtService jwtService;
    private final PersonRepository personRepository;

    @Value("${app.frontend.redirect-uri}")
    private String frontendRedirectUri;

    public OAuth2LoginSuccessHandler(JwtService jwtService, PersonRepository personRepository) {
        this.jwtService = jwtService;
        this.personRepository = personRepository;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response, Authentication authentication) throws IOException, ServletException {
        // 1. Grab the user data sent back from Google
        OAuth2User oAuth2User = (OAuth2User) authentication.getPrincipal();
        String email = oAuth2User.getAttribute("email");
        String name = oAuth2User.getAttribute("name");
        String picture = oAuth2User.getAttribute("picture");

        // 2. Check if they exist in our database. If they are brand new, register them!
        Person person = personRepository.findByEmail(email).orElseGet(() -> {
            Person newPerson = new Person();
            newPerson.setEmail(email);
            newPerson.setName(name);
            newPerson.setPictureUrl(picture);
            return personRepository.save(newPerson);
        });

        // Signing in again is how a deactivated account comes back. Without this the login still
        // succeeds and hands out a JWT, but UserDetailsService filters on isActive(), so every
        // subsequent request 401s and the app force-logs-out in a loop.
        if (!person.isActive()) {
            person.setActive(true);
            personRepository.save(person);
        }

        // Keep the profile picture fresh on subsequent logins.
        if (picture != null && !picture.equals(person.getPictureUrl())) {
            person.setPictureUrl(picture);
            personRepository.save(person);
        }

        // 3. Print the VIP Wristband (Generate the JWT)
        String token = jwtService.generateToken(person.getEmail());

        // 4. Build the Deep Link to open the Flutter app and pass the token securely
        if (frontendRedirectUri == null) {
            throw new IllegalStateException("frontendRedirectUri is not configured");
        }
        String targetUrl = UriComponentsBuilder.fromUriString(frontendRedirectUri)
                .queryParam("token", token)
                .build().toUriString();

        // 5. Fire the redirect! (This sends them to fairshare://login-success?token=...)
        getRedirectStrategy().sendRedirect(request, response, targetUrl);
    }
}