# VISION_MASTER_PRODUCT_SPEC.md

## Vision Master Product Specification
**Version:** 1.0  
**Language:** English  
**Audience:** Founder, AI implementation agent, technical lead, product owner, engineering team, QA  
**Status:** Authoritative execution companion document

---

## 1. Purpose of This Document

This document is the **product and operational specification** for Vision.

It is meant to be used together with:

1. `Vision_Greenfield_Blueprint.md` — the architectural constitution
2. `VISION_DAY_ZERO_IMPLEMENTATION_ROADMAP.md` — the build order and execution plan

This file does **not** replace the architecture blueprint.  
It turns the business idea, operating logic, domain rules, and required behaviors into a single cohesive product specification that an AI agent or engineering team can actually build against.

This document defines:

- what Vision is as a product
- which user types exist
- what each surface must do
- how bookings, ERP workflows, POS, inventory, and platform administration connect together
- which business rules are mandatory
- which modules are required
- what must be measured
- what non-functional expectations apply
- what “done properly” means

---

## 2. Product Definition

Vision is a **multi-tenant SaaS platform for barbershops, beauty salons, and chains of branches**.

It combines three tightly connected product surfaces:

1. **Public booking website** for end customers
2. **Tenant ERP** for owners, branch teams, cashiers, providers, and operational staff
3. **Platform admin console** for central control of tenants, subscriptions, support, and platform oversight

Vision is not just a booking app.  
Vision is not just a POS.  
Vision is not just an ERP.

It is an operational system that starts with online discovery and booking, flows into branch execution, ends in an invoice and receipt, and feeds reporting, KPI, staff performance, and owner-level visibility.

---

## 3. Business Goal

The commercial goal of Vision is to give each tenant an end-to-end operating system that helps them:

- acquire customers through a professional booking website
- convert demand into actual appointments
- run branch operations in a controlled way
- complete service transactions through POS and invoicing
- manage products, services, offers, inventory, and staff
- monitor performance across one or multiple branches
- scale from a single branch to a full chain without rebuilding their operating model

The platform-level goal is to let the Vision operator sell this as a subscription SaaS product to many independent owners and chains, while keeping tenant data isolated and platform controls centralized.

---

## 4. Product Surfaces

### 4.1 Public Booking Website
The public-facing customer experience for each tenant or chain.

Core responsibilities:

- customer registration and login
- tenant/brand presentation
- branch selection
- service and package browsing
- offer discovery
- booking flow
- appointment confirmation
- customer self-service for upcoming and past bookings
- booking cancellation or rescheduling where allowed
- customer profile and account settings

### 4.2 Tenant ERP
The internal operating system for each tenant and its branches.

Core responsibilities:

- appointments operations
- customer management
- employee management
- permissions and branch scope
- service catalog management
- offers and package management
- booking website content management
- POS and invoicing
- treasury / cash drawer operations
- inventory management
- branch-level and tenant-level dashboards
- provider performance tracking

### 4.3 Platform Admin Console
The platform operator’s control layer.

Core responsibilities:

- tenant creation and activation
- subscription and plan controls
- branch and user limits
- module entitlement controls
- platform internal admin management
- ticket handling
- support and IT access workflows
- tenant oversight
- global usage analytics
- payment and subscription monitoring
- operational and security visibility

---

## 5. Core Multi-Tenant Model

Vision is a real multi-tenant system.

### 5.1 Tenant
A tenant represents one owner or one business chain.

A tenant may have:

- one branch only
- multiple branches under the same owner
- shared branding across branches
- branch-specific differences in prices, availability, and operational configuration

### 5.2 Branch
A branch is an operational unit under a tenant.

A branch has its own:

- staff
- schedule
- service availability
- branch-level prices where allowed
- inventory
- booking capacity
- cashier activity
- KPI and performance metrics

### 5.3 Platform
The platform sits above all tenants and controls subscription, provisioning, support access, and oversight.

Platform access must never collapse tenant isolation.  
Platform access must remain explicit, controlled, and auditable.

---

## 6. User Types

### 6.1 Customer Users
- visitor
- registered customer
- returning customer
- customer with future bookings
- customer with past bookings
- customer without email at point of sale but later linked to an account

### 6.2 Tenant Internal Users
- owner
- branch manager
- receptionist / booking operator
- cashier
- accountant
- barber / stylist / provider
- inventory or store user
- website/content manager
- marketing user if needed later

### 6.3 Platform Users
- platform super admin
- platform admin
- subscription / finance operator
- support agent
- IT / technical support user
- ticket operations user
- analytics or operations reviewer

Each user type must be authorization-driven, not UI-driven.  
The system must not rely on hidden buttons as permission enforcement.

---

## 7. Identity and Access Expectations

### 7.1 ERP Login Model
Internal ERP login is based on a controlled user creation model.

At minimum, the system must support:

- slug or tenant-aware login context
- phone number
- password
- internal user profile data
- role assignment
- branch assignment
- optional multi-branch access
- secure sessions
- MFA for sensitive internal roles

### 7.2 Customer Login Model
Customer access must support:

- registration
- login
- password reset
- account profile
- linking historical receipts or transactions where identity becomes complete later

### 7.3 Multi-Branch Context
If an internal user has access to more than one branch:

- they must see a branch selector
- the active branch context must be explicit
- all branch-scoped actions must respect the selected context

If they only have one branch:

- they should enter directly

### 7.4 Owner Scope
An owner must be able to:

- access all branches under the tenant
- view tenant-wide dashboards
- access branch-specific screens
- manage website configuration
- manage branch settings and users within allowed boundaries

---

## 8. Product Scope by Domain

## 8.1 Tenant Provisioning Domain

The platform admin must be able to:

- create a new tenant
- assign owner identity
- configure branch count limits
- configure employee limits
- configure plan/module entitlements
- decide whether booking website access is enabled
- generate onboarding access links
- activate or suspend the tenant
- view subscription period, price, renewal, and status

Outputs of tenant provisioning should include:

- tenant record
- owner record
- default branch or branch setup flow
- entitlement configuration
- controlled onboarding path

---

## 8.2 Branch Management Domain

The owner or authorized internal user must be able to:

- create branches
- edit branch details
- manage branch status
- set branch schedule
- define branch-level availability
- decide whether specific services, offers, or providers are available in a branch
- manage branch contact and presentation details

The system must support branch-level override where appropriate, without losing tenant-level consistency.

---

## 8.3 Staff and Internal User Management Domain

The owner must be able to create internal users and assign them to one or more branches.

Each internal user should support:

- full name
- phone number
- login credentials
- role
- branch assignment
- optional multi-branch access
- provider/barber flag where relevant
- working schedule
- visibility permissions
- operational permissions
- optional access to provider-specific views

The system must support a distinction between:

- internal user identity
- provider/barber profile
- operational role
- branch assignment

This prevents role confusion later.

---

## 8.4 Service Catalog Domain

The system must support service definition at the tenant level, with branch-level operational control.

A service should support:

- name
- description
- category
- duration
- standard price
- tax behavior if needed later
- image or media where relevant
- active/inactive status
- display order
- branch availability
- branch-level price override where allowed
- assigned providers or provider eligibility

---

## 8.5 Packages and Offers Domain

The tenant must be able to define packages and offers that appear on the booking website and ERP.

A package or offer may include:

- one or more services
- promotional pricing
- start/end dates
- branch eligibility
- presentation image
- discount amount or rate
- visibility status
- terms and restrictions

Branches may be allowed to:

- enable/disable availability
- override price within policy
- manage branch-specific activation

The website must present discounts and offers professionally and clearly.

---

## 8.6 Booking Website Management Domain

The owner needs a high-quality internal interface to control the booking website.

This is a premium-value area of the product and cannot be treated as a low-grade admin form.

The website management experience must support:

- brand/site name
- logo
- colors
- visual style
- hero sections or homepage presentation
- service display layout
- offer highlighting
- branch presentation
- preview mode with realistic rendering
- content blocks that affect public presentation

This area must feel polished because it is one of the main reasons a paying owner values the product.

---

## 8.7 Customer Booking Domain

The customer-facing booking flow must support:

- login/registration before finalizing booking
- selecting a branch when multiple branches exist
- viewing services and packages
- seeing pricing, duration, and offer details
- selecting a provider/barber optionally
- selecting a date and time
- confirming a booking
- reviewing booking details
- later viewing upcoming and past bookings
- editing or canceling a booking based on tenant policy

### Provider Selection Logic
Provider selection must be configurable at two levels:

1. owner/tenant level master switch
2. branch-level switch

Rules:

- if owner disables provider selection, branch settings cannot override it on
- if owner enables it, each branch may still choose to keep it off
- if the customer chooses no provider, the booking remains assignable later

---

## 8.8 Appointment Operations Domain

Inside ERP, appointments must be manageable through an operational module.

The appointments module must support:

- calendar/list views
- filtering by branch, date, provider, status
- booking confirmation
- rescheduling
- cancellation
- no-show marking
- provider assignment
- walk-in handling
- operator notes where allowed
- appointment detail panel

Clicking an appointment should show:

- customer name
- phone number
- booking time
- selected branch
- selected service/package
- assigned provider if any
- booking history
- previous appointments
- quick confirmation actions
- quick call action for mobile use

---

## 8.9 Provider Assignment Domain

A booking may start without a provider assigned.

The system must then support controlled assignment later by:

- reception / booking operations
- branch manager
- authorized appointment operator
- cashier at invoice closure if it remained unassigned until service completion

Hard rule:

**Every closed invoice must end with an assigned provider/barber.**

This applies to:

- online bookings
- walk-ins
- offline sales connected to services

Provider-linked activity must feed provider KPI and branch performance reporting.

---

## 8.10 POS and Cashier Domain

The POS is a core execution surface, not an optional add-on.

It must support:

- creating a sale/invoice
- adding services
- adding retail products
- attaching customer phone number as a required field
- selecting or confirming provider/barber before closing
- calculating totals
- applying payment method
- closing the invoice
- generating a receipt
- maintaining invoice records
- supporting cash and card/visa flows
- linking the invoice to branch, cashier, customer, and provider

The system must support a clear cashier experience that can be used quickly in a live branch environment.

---

## 8.11 Treasury and Cash Drawer Domain

The cashier operation must support:

- drawer opening balance
- shift handover
- drawer transfer to next shift
- cash totals
- card totals
- variance visibility where needed
- branch-level treasury aggregation

This does not need to become enterprise accounting from day one, but it must not be fake or disconnected from sales reality.

---

## 8.12 Invoice and Receipt Domain

Invoices must be durable business records.

The system should support:

- invoice numbering
- invoice customer linkage
- service and product line items
- payment method
- totals and discounts
- assigned provider
- branch and cashier reference
- receipt generation
- later customer retrieval by account/email where possible

Special rule:

- if a customer has no email at invoice time, invoices should still be stored
- when the customer later completes account identity with email, the historical invoices can become visible in their account if policy allows
- the system should distinguish between online booking history and offline service history when necessary, without hiding the business connection

---

## 8.13 Inventory Domain

Each branch must be able to manage product stock with appropriate permissions.

Inventory must support:

- product catalog presence
- branch stock quantity
- stock movement or at least controlled quantity adjustment
- automatic deduction when a product is sold via POS
- product availability status
- branch-level control over sale availability

This domain is branch-sensitive and should not be treated as merely cosmetic.

---

## 8.14 Customer Domain

The system must build a useful customer record over time.

A customer record may include:

- name
- phone number
- email if available
- account status
- booking history
- visit history
- spending history
- branch history
- service preferences later if desired
- invoice history
- cancellation or no-show history

The customer domain should unify booking-originated customers and branch-originated customers as identity becomes clearer.

---

## 8.15 Provider Experience Domain

Providers/barbers/stylists must have a controlled internal experience.

At minimum, a provider should be able to:

- see their assigned appointments
- see their schedule
- view relevant customer names and booking times
- view limited profile or appointment detail needed for operation
- see their own work performance where allowed

Providers should not automatically gain broader branch or tenant access just because they are service providers.

---

## 8.16 Notifications Domain

The system should support notifications for operational reliability.

At minimum, notifications should support:

- booking confirmation
- reschedule or cancellation messages
- internal alerts for approaching appointments
- provider reminders when an assigned booking is near
- internal prompts for unassigned bookings that must be assigned before start time

Channels can begin simply, but the model should allow growth.

---

## 8.17 Ticketing and Internal Support Domain

ERP users must be able to submit tickets.

The ticketing workflow must support:

- ticket creation by authorized internal users
- categorization
- status tracking
- assignment to internal platform staff
- comments or response history
- closure workflow
- auditable handling

This is a platform operations requirement, not a nice-to-have.

---

## 8.18 Platform Support Access Domain

Platform admin must be able to enter a tenant context for support and IT work, but this must be controlled.

Required properties:

- explicit access workflow
- role-limited usage
- audit trail
- controlled support mode
- no hidden unlimited bypass
- support access must match the architecture rules from the blueprint

---

## 8.19 Subscription and Entitlement Domain

The platform admin needs commercial and operational control over tenant subscriptions.

This domain must support:

- subscription type
- start and end date
- billing amount
- module entitlement list
- branch/user limits
- booking website enabled or disabled
- activation state
- renewal tracking
- payment status visibility

The system should make it easy to understand what the tenant paid for and what they are allowed to use.

---

## 8.20 Platform Analytics Domain

The platform console must support visibility across tenants, including:

- total tenants
- active tenants
- booking volume
- user activity on booking websites
- ticket volumes
- subscription status distribution
- operational health indicators
- tenant KPI snapshots

The purpose is not vanity charts.  
The purpose is platform control, support insight, and business intelligence.

---

## 9. Core End-to-End Workflows

### 9.1 Online Booking to Invoice Workflow
1. Owner configures services, offers, pricing, providers, and website content
2. Customer visits booking website
3. Customer selects branch, service/package, time, and optionally provider
4. Booking is created
5. Booking appears in ERP appointment operations
6. Booking is confirmed, rescheduled, or assigned if needed
7. Customer arrives
8. Cashier creates or opens service sale
9. Invoice is completed with provider attached
10. Receipt is generated
11. Product stock is deducted if products were sold
12. Booking/invoice/provider/branch KPIs update

### 9.2 Walk-In Offline Service Workflow
1. Customer comes without online booking
2. Branch user creates service sale
3. Customer phone number is captured
4. Provider is selected
5. Invoice is closed
6. Receipt is generated
7. Service performance still counts for provider, branch, and owner analytics

### 9.3 Unassigned Booking Workflow
1. Customer books without selecting provider
2. Booking enters unassigned operational queue
3. Branch operations or reception assigns provider before appointment start
4. If still not assigned before service completion, cashier must assign provider during invoice closure
5. No closed invoice may remain providerless

### 9.4 Multi-Branch Owner Workflow
1. Owner logs in
2. Owner sees tenant-wide dashboard
3. Owner can enter any branch context
4. Owner can manage branch services, staff, and website visibility according to scope
5. Owner can compare performance across branches

### 9.5 Platform Tenant Provisioning Workflow
1. Platform admin creates a new tenant
2. Platform admin defines plan, limits, and enabled modules
3. Owner access is generated
4. Tenant onboarding begins
5. Default configuration is completed
6. Tenant becomes active

---

## 10. Mandatory Business Rules

The following rules are not optional.

### 10.1 Booking Rules
- online booking does not require payment in the first version
- branch selection is required when the tenant has multiple branches
- provider selection is optional if enabled by configuration
- bookings without provider must remain operationally assignable
- booking time selection must respect branch/provider availability rules

### 10.2 Provider Rules
- provider selection feature is controlled by tenant then branch
- a branch cannot enable provider selection if the tenant disabled it globally
- every completed service invoice must map to a provider
- provider-linked results must feed provider KPI and performance history

### 10.3 POS Rules
- a customer phone number is required on every invoice
- invoice closure requires a provider for service transactions
- invoices must be branch-scoped and cashier-linked
- payment method must be recorded
- receipt generation is mandatory

### 10.4 Product and Offer Rules
- products and offers originate from owner-controlled setup
- branch may control price and availability based on policy
- website presentation must reflect valid discount logic and branch availability

### 10.5 Customer Identity Rules
- customers may start with incomplete identity
- invoice history must not be lost because email was missing at point of sale
- later customer identity completion may unlock access to historical receipts where allowed

### 10.6 Platform Rules
- platform admins can manage tenants, plans, entitlements, and platform operations
- platform support access must be controlled and auditable
- platform internal users must also have scoped permissions; not every platform user is super admin

---

## 11. KPI and Reporting Requirements

Vision needs meaningful dashboards at multiple levels.

### 11.1 Branch KPIs
- total bookings
- completed bookings
- canceled bookings
- no-show rate
- walk-ins
- total sales
- average ticket size
- service sales vs product sales
- provider performance
- branch utilization
- top services
- top products

### 11.2 Provider KPIs
- bookings assigned
- services completed
- revenue attributed
- rebooking or repeat indicators later
- no-show impact where relevant
- schedule utilization

### 11.3 Owner / Tenant KPIs
- branch comparison
- growth in bookings
- revenue performance
- service mix
- offer performance
- customer trends
- branch-by-branch operational performance

### 11.4 Platform KPIs
- active tenants
- subscription distribution
- total booking volume
- ERP activity
- ticket volume and resolution
- booking website usage
- platform-level health indicators

---

## 12. UX and Product Quality Expectations

Vision is an operations-heavy product. The UX cannot be decorative nonsense.

### Required UX qualities:
- fast internal workflows
- low-friction appointment handling
- clear branch context
- clear role-based navigation
- polished website customization experience
- professional public-facing booking pages
- responsive layouts where needed
- strong form validation and actionable errors
- high operational clarity in cashier and booking screens

The website customization area deserves special attention.  
It is one of the strongest owner-facing value propositions and must feel premium.

---

## 13. Security and Trust Boundaries

This document follows the architecture blueprint and assumes the following are mandatory:

- strict tenant isolation
- centralized authorization
- server-side enforcement
- database-backed sessions
- MFA for sensitive internal roles
- audited support access
- DTO allowlists for writes
- no UI-only security
- no hidden permanent bypass user
- strong internal/public/platform surface separation

No one should claim “zero vulnerabilities.”  
That is fake language.  
The requirement is a system built on strong security foundations with fail-closed behavior, clear boundaries, and test-backed enforcement.

---

## 14. High-Level Data Domain Expectations

The exact schema belongs in dedicated design work, but the following domain objects are expected to exist in some form:

- tenant
- subscription / plan / entitlement
- branch
- internal user
- role / permission relation
- provider profile
- customer
- customer account
- service
- package / offer
- branch service pricing / availability
- appointment / booking
- appointment status history
- invoice
- invoice line
- payment record
- receipt artifact or printable output reference
- inventory item / stock balance / stock movement
- ticket
- notification event/log
- website configuration
- audit log
- support grant / support access event

---

## 15. Out-of-Scope for Initial Version Unless Explicitly Added

These are not forbidden forever, but they should not silently expand the first build:

- online payment gateway integration
- marketplace-style multi-brand discovery across unrelated tenants
- advanced accounting suite equal to full ERP finance products
- loyalty engines
- complex CRM automation
- custom domain automation on day one
- AI recommendation engine inside the product itself
- native mobile apps before web surfaces are solid

---

## 16. Delivery Expectations for the AI Agent or Engineering Team

The builder must not jump straight into UI mock implementation.

The execution order must respect:

1. architecture foundation
2. auth and tenancy
3. data model
4. platform provisioning
5. booking engine
6. ERP operations
7. POS and inventory
8. notifications and reporting
9. hardening and deployment

Every major area must be built with:

- explicit contracts
- tests
- permission enforcement
- branch/tenant scope discipline
- predictable workflows
- auditable behavior where sensitive

---

## 17. Definition of Success

Vision is successful when:

- a new tenant can be provisioned cleanly
- an owner can manage one or many branches
- customers can book online without confusion
- internal teams can operate bookings and walk-ins reliably
- every service sale ends in a valid invoice and receipt
- provider performance is traceable
- branch stock reflects reality
- owners can manage website content and offers without developer involvement
- platform admins can manage subscriptions and support operations without breaking tenant boundaries
- dashboards reflect useful business reality rather than fake vanity metrics

---

## 18. Final Position

Vision must be treated as a serious SaaS operating platform for a real-world service business.

The wrong way to build it is:

- to treat it as just a booking front-end
- to bolt on ERP later
- to treat POS as an afterthought
- to hide permission problems in UI
- to improvise tenant isolation
- to delay support access controls
- to skip structured build order

The right way is to treat bookings, ERP, POS, inventory, platform operations, permissions, and tenant isolation as one coherent system from day one.

That is what this document is for.
