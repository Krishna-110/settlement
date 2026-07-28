package com.fairshare.debt_settlement.repository;

import com.fairshare.debt_settlement.model.Person;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PersonRepository extends JpaRepository<Person, Long> {



    Optional<Person> findByEmail(String email);

    Optional<Person> findByPhoneNumber(String phoneNumber);

    java.util.List<Person> findAllByPhoneNumberIn(java.util.Collection<String> phoneNumbers);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query(value = "DELETE FROM person_friends WHERE person_id = :personId OR friend_id = :personId", nativeQuery = true)
    void removeAllFriendships(@org.springframework.data.repository.query.Param("personId") Long personId);

    /**
     * Mirrors a batch of friendships back towards the given user in ONE statement.
     * person_friends stores both directions, and loading each friend's lazy getFriends()
     * collection just to add one row was the main cost of a contact sync.
     */
    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query(value =
            "INSERT INTO person_friends (person_id, friend_id) " +
            "SELECT p.id, :userId FROM persons p " +
            "WHERE p.id IN (:friendIds) " +
            "AND NOT EXISTS (SELECT 1 FROM person_friends pf " +
            "                WHERE pf.person_id = p.id AND pf.friend_id = :userId)",
            nativeQuery = true)
    void addReverseFriendships(@org.springframework.data.repository.query.Param("userId") Long userId,
                               @org.springframework.data.repository.query.Param("friendIds") java.util.Collection<Long> friendIds);

}
