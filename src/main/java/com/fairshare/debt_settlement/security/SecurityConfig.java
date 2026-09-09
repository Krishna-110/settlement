package com.fairshare.debt_settlement.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthFilter;
    private final OAuth2LoginSuccessHandler oAuth2LoginSuccessHandler;

    // Comma-separated origin patterns allowed to call the API from a BROWSER.
    // Note: the mobile app is unaffected by this - CORS is a browser-only mechanism and native
    // apps send no Origin header. Override with APP_CORS_ALLOWED_ORIGINS (no rebuild needed).
    @Value("${app.cors.allowed-origins:https://settlementapi.ssbpgc.com,http://localhost:*,https://localhost:*}")
    private String allowedOrigins;

    // Inject both the Bouncer and the Success Bridge
    public SecurityConfig(JwtAuthenticationFilter jwtAuthFilter, OAuth2LoginSuccessHandler oAuth2LoginSuccessHandler) {
        this.jwtAuthFilter = jwtAuthFilter;
        this.oAuth2LoginSuccessHandler = oAuth2LoginSuccessHandler;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   ClientRegistrationRepository clientRegistrationRepository) throws Exception {
        http
                // 1. Disable CSRF (We use JWTs, so we don't need this)
                .csrf(csrf -> csrf.disable())

                // 1b. CORS, configured centrally instead of scattered @CrossOrigin annotations.
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))

                // 2. Configure Endpoint Rules
                .authorizeHttpRequests(auth -> auth
                        // Allow login routes, error pages, and static assets
                        .requestMatchers("/error", "/", "/login**", "/oauth2/**", "/favicon.ico").permitAll()
                        // Lock down all actual data APIs
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().authenticated()
                )

                // 2b. Unauthenticated /api/** must answer 401, not redirect.
                //
                // oauth2Login() installs a browser-style entry point, so without this an expired or
                // rejected token on /api/profile 302s to /oauth2/authorization/google, then on to
                // accounts.google.com. The mobile client follows redirects, so it received HTTP 200
                // with ~885KB of Google's sign-in HTML instead of a 401: the 401 interceptor never
                // fired, and the HTML string landed in the store where a list was expected, so the
                // next .map() over it crashed the app. Browser OAuth login is untouched - this only
                // changes what /api/** returns.
                .exceptionHandling(ex -> ex.defaultAuthenticationEntryPointFor(
                        new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED),
                        request -> request.getRequestURI().startsWith("/api/")))

                // 3. Stateless Sessions (Crucial for APIs interacting with Mobile Apps)
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                )

                // 4. Enable OAuth2 Login and attach our custom Success Handler.
                //    Force Google's account chooser every time so re-login after logout
                //    always asks which account (instead of silently reusing the session).
                .oauth2Login(oauth2 -> oauth2
                        .authorizationEndpoint(endpoint -> endpoint
                                .authorizationRequestResolver(
                                        accountChooserResolver(clientRegistrationRepository)))
                        .successHandler(oAuth2LoginSuccessHandler)
                )

                // 5. Add our custom JWT filter BEFORE the standard Spring filter
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(o -> !o.isEmpty())
                .toList());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    // Adds prompt=select_account to the Google authorization request so the user is always
    // shown the account picker, even if they're still signed in to Google in the browser.
    private OAuth2AuthorizationRequestResolver accountChooserResolver(
            ClientRegistrationRepository repo) {
        DefaultOAuth2AuthorizationRequestResolver resolver =
                new DefaultOAuth2AuthorizationRequestResolver(repo, "/oauth2/authorization");
        resolver.setAuthorizationRequestCustomizer(customizer ->
                customizer.additionalParameters(params -> params.put("prompt", "select_account")));
        return resolver;
    }
}