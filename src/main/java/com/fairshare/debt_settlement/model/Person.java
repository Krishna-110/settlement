package com.fairshare.debt_settlement.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.ColumnDefault;

@Entity
@Table(name = "persons")
@Data
// Identity is by id only: mutable fields (phoneNumber, hidePhone, ...) must never affect
// equals/hashCode, or mutating a Person already stored in a HashSet<Person> (friends, group
// members) can silently corrupt that set's lookups.
@EqualsAndHashCode(of = "id")
@NoArgsConstructor
public class Person {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(unique = true)
    private String phoneNumber;

    // Profile picture (from Google on login).
    private String pictureUrl;

    // Privacy + notification preferences.
    // @ColumnDefault ensures the ALTER TABLE that adds this NOT NULL column also backfills a
    // default for EXISTING rows - without it, Postgres rejects adding a NOT NULL column to a
    // non-empty table (the Java "= false" default only applies to newly-created objects).
    @Column(nullable = false)
    @ColumnDefault("false")
    private boolean hidePhone = false;

    @Column(nullable = false)
    @ColumnDefault("false")
    private boolean hideEmail = false;

    @Column(nullable = false)
    @ColumnDefault("true")
    private boolean notificationsEnabled = true;

    // Soft deactivation: the row (and therefore all settled history) is kept, but the person can no
    // longer sign in and stops appearing to others as someone to add or transact with.
    @Column(nullable = false)
    @ColumnDefault("true")
    private boolean active = true;

    @ManyToMany
    @JoinTable(
        name = "person_friends",
        joinColumns = @JoinColumn(name = "person_id"),
        inverseJoinColumns = @JoinColumn(name = "friend_id")
    )
    @com.fasterxml.jackson.annotation.JsonIgnore
    @lombok.ToString.Exclude
    private java.util.Set<Person> friends = new java.util.HashSet<>();

}
