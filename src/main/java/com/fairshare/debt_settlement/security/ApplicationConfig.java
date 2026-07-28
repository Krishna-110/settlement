package com.fairshare.debt_settlement.security;

import com.fairshare.debt_settlement.repository.PersonRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import java.util.Collections;

@Configuration
public class ApplicationConfig {

    private final PersonRepository personRepository;

    public ApplicationConfig(PersonRepository personRepository) {
        this.personRepository = personRepository;
    }

    @Bean
    public UserDetailsService userDetailsService() {
        return username -> personRepository.findByEmail(username)
                // A deactivated account can no longer authenticate - this also invalidates any JWT
                // that was issued before deactivation, since every request re-resolves the user here.
                .filter(person -> person.isActive())
                .map(person -> new User(
                        person.getEmail(),
                        "", // We use an empty password because Google handles the actual authentication!
                        Collections.emptyList() // This is where we would put Roles (like "ADMIN" or "USER")
                ))
                .orElseThrow(() -> new UsernameNotFoundException("User not found with email: " + username));
    }
}