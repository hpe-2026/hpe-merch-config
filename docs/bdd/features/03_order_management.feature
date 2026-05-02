Feature: Order Management

  As a logged-in user
  I want to view my orders
  So that I can track my purchases

  # POSITIVE SCENARIOS

  Scenario: Authenticated user can view their orders
    Given the order service is running
    And I am authenticated as a user
    When I request my orders
    Then I should receive my order list
    And each order should have order details

  Scenario: Admin can view all orders
    Given the order service is running
    And I am authenticated as an admin
    When I request all orders
    Then I should receive all orders in the system

  # NEGATIVE SCENARIOS

  Scenario: Unauthenticated user cannot view orders
    Given the order service is running
    And I am not authenticated
    When I request orders
    Then I should receive a 401 unauthorized error

  Scenario: Regular user cannot view other user's orders
    Given the order service is running
    And I am authenticated as user "user1@test.com"
    When I request orders for another user
    Then I should receive an access denied error

  Scenario: Invalid order ID returns error
    Given the order service is running
    And I am authenticated as a user
    When I request order with invalid ID "invalid_id_format"
    Then I should receive a 400 error
