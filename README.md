# Smart Parking Allocation & Violation Management System

A database-driven web application for intelligent parking slot allocation, parking management, payment tracking and violation management.

**Course:** DBMS Experiential Learning – Level 3 Mini Project  
**University:** PES University, Bengaluru  
**Project Type:** Two-member team project

---

## 1. Team Members

| Member | Name | University ID | Primary Responsibilities |
|---|---|---|---|
| Member A | Syed Obaid Faraz | PES2UG24CS546 | Core parking management, database setup, slot allocation and dashboard |
| Member B | Suryatej V | PES2UG24CS541 | Violation management, payments, notices and MongoDB audit logging |

Both members are responsible for contributing to database development, application development, testing, integration and documentation.

---

## 2. Project Overview

The Smart Parking Allocation & Violation Management System aims to provide an integrated platform for managing parking facilities, allocating parking spaces, maintaining vehicle and driver records, processing payments and handling parking violations.

Traditional parking management systems often rely on manual processes for identifying available spaces, recording vehicle entries and exits, calculating parking charges and managing violations.

This project addresses these challenges through a centralized web-based application backed by relational and NoSQL databases.

The system will allow administrators and parking staff to manage parking areas, monitor slot availability, register drivers and vehicles, allocate parking spaces, record payments and maintain violation records.

The application will also provide useful information through dashboards, reports and historical records.

The project is designed to demonstrate practical Database Management System concepts, including relational database design, SQL operations, database integrity, transactions, triggers, indexing, views and integration with a second database paradigm.

---

## 3. Problem Statement

Parking facilities require efficient management of parking spaces, vehicle information, allocations, payments and violations.

Manual management can lead to:

- Difficulty identifying available parking spaces.
- Duplicate or conflicting parking allocations.
- Inefficient tracking of vehicle entry and exit.
- Inaccurate parking charge calculations.
- Difficulty maintaining driver and vehicle records.
- Poor tracking of unpaid parking fees and violation fines.
- Lack of centralized reporting and historical records.

The proposed system aims to address these issues through a database-backed application that provides structured parking allocation, payment processing, violation management and reporting.

---

## 4. Project Objectives

The primary objectives are:

1. Develop a centralized parking management system.
2. Maintain information about parking areas and individual parking slots.
3. Register and manage drivers and their vehicles.
4. Implement a mechanism for allocating available parking slots.
5. Track vehicle check-in and check-out times.
6. Calculate and record parking charges.
7. Maintain parking violation records and associated fines.
8. Track violation payments and payment status.
9. Generate and manage notices for drivers.
10. Provide dashboards and reports for administrators and parking staff.
11. Demonstrate practical SQL and NoSQL database integration.
12. Implement advanced DBMS concepts beyond basic CRUD operations.

---

## 5. Project Scope and Features

The following features define the planned scope of the application.

### 5.1 Admin Management

- Admin authentication.
- Management of parking areas.
- Management of parking slots.
- Monitoring of parking operations.
- Access to system reports.

### 5.2 Parking Area Management

- Create and manage parking areas.
- Store parking area names and locations.
- Maintain total parking capacity.
- Categorize parking areas by type.
- Monitor occupancy.

### 5.3 Parking Slot Management

- Maintain individual parking slot records.
- Store slot number, floor level and slot type.
- Track slot availability and occupancy.
- Maintain hourly parking rates.
- Identify suitable available parking spaces.

### 5.4 Driver and Vehicle Management

- Register drivers.
- Maintain driver contact information.
- Register vehicles.
- Store vehicle registration numbers, types, makes and colours.
- Associate drivers with their vehicles.

### 5.5 Smart Parking Allocation

- Identify available parking slots.
- Allocate suitable slots to vehicles.
- Record check-in times.
- Record check-out times.
- Prevent conflicting active allocations.
- Update slot availability after allocation and release.

### 5.6 Parking Payment Management

- Record parking payments.
- Associate payments with parking allocations.
- Maintain payment dates, amounts and payment methods.
- Track payment status.
- Maintain payment history.

### 5.7 Violation Management

- Record parking violations against drivers.
- Maintain violation types, dates, locations and fines.
- Retrieve violation history.
- Track outstanding violation fines.

### 5.8 Violation Payment Management

- Record payments against violations.
- Maintain payment dates, amounts and payment methods.
- Track whether violation fines have been paid.
- Retrieve violation payment history.

### 5.9 Notice Management

- Generate and maintain notices for drivers.
- Record notice dates, subjects and messages.
- Associate notices with relevant drivers.

### 5.10 Dashboard and Reporting

Planned dashboard information includes:

- Total parking areas.
- Total parking slots.
- Occupied and available slots.
- Parking occupancy by area.
- Active allocations.
- Parking revenue.
- Outstanding violation fines.
- Total violations.
- Payment history.

---

## 6. Technology Stack

The proposed technology stack is:

| Component | Technology | Purpose |
|---|---|---|
| Frontend | Next.js | Web application interface |
| Programming Language | TypeScript | Application development |
| Backend/API | Next.js Route Handlers | Server-side business logic and API endpoints |
| Relational Database | PostgreSQL | Structured relational data |
| NoSQL Database | MongoDB | Audit logs and activity records |
| SQL Driver | `pg` | PostgreSQL connectivity |
| MongoDB Driver | `mongodb` | MongoDB connectivity |
| Authentication Utilities | `jose` | Secure session/token utilities |
| Password Hashing | `bcryptjs` | Password hashing |
| Input Validation | `zod` | Server-side request validation |
| Version Control | Git | Source code versioning |
| Repository Hosting | GitHub | Collaboration and source code management |
| Code Editor | Visual Studio Code | Development environment |

### Why PostgreSQL?

The core parking system contains highly structured data with relationships between drivers, vehicles, parking areas, slots, allocations, payments and violations.

PostgreSQL is appropriate because it provides:

- Relational database management.
- Primary and foreign keys.
- Referential integrity.
- CHECK and UNIQUE constraints.
- Transactions.
- Triggers.
- Views.
- Stored functions.
- Indexing.
- Complex SQL queries and joins.

### Why MongoDB?

MongoDB will be used for flexible records such as application activity and audit logs.

Potential audit events include:

- Parking allocation created.
- Parking allocation released.
- Violation recorded.
- Payment processed.
- Notice issued.

These records can contain event types, timestamps, associated entity identifiers and relevant metadata.

The MongoDB component will demonstrate the use of a second database paradigm alongside PostgreSQL.

The application must perform actual MongoDB writes and reads; simply establishing a connection is not sufficient.

---

## 7. Database Design

The project uses the team's existing ER diagram and relational schema as the foundation for implementation.

### 7.1 Entities

The current ER diagram contains the following main entities:

| Entity | Description |
|---|---|
| ADMIN | Stores administrator information and credentials |
| PARKING_AREA | Stores parking facility information |
| PARKING_SLOT | Stores individual parking slot information |
| VEHICLE | Stores registered vehicle information |
| DRIVER | Stores driver information |
| ALLOCATION | Records vehicle-to-slot parking allocations |
| PAYMENT | Records parking allocation payments |
| VIOLATION | Records parking violations and fines |
| VIOLATION_PAYMENT | Records payments against violations |
| NOTICE | Stores notices issued to drivers |

The relational schema also includes:

| Table | Description |
|---|---|
| DRIVER_PHONE | Stores driver phone numbers separately |

### 7.2 Important Database Relationships

The existing ER design includes relationships such as:

- An admin manages parking areas.
- A parking area contains multiple parking slots.
- A driver can have associated vehicles.
- Vehicles participate in parking allocations.
- Parking slots are assigned through allocations.
- Allocations have associated parking payments.
- Drivers can have multiple violations.
- Violations can have associated violation payments.
- Drivers can receive notices.

The exact cardinalities, participation constraints and foreign key relationships must follow the supplied ER diagram and the finalized relational schema.

Any proposed schema changes must be discussed and agreed upon by both team members before implementation.

### 7.3 Database Files

The planned SQL files are:

| File | Purpose |
|---|---|
| `database/schema.sql` | Table definitions, primary keys, foreign keys and constraints |
| `database/seed.sql` | Sample data for development and demonstration |
| `database/advanced_features.sql` | Triggers, views, functions and indexes |
| `database/queries.sql` | Important SQL queries demonstrating DBMS concepts |

---

## 8. Advanced DBMS Concepts

The project aims to implement at least four advanced database concepts, as required by the course.

The planned concepts are:

### 8.1 Transactions

Transactions will be used in operations requiring multiple database changes.

Example: Parking allocation should create an allocation record and update slot availability atomically.

If an operation fails, the transaction should roll back to preserve database consistency.

### 8.2 Triggers

Triggers can automatically maintain relevant database states.

Example: Updating parking slot availability when an allocation is created or completed.

### 8.3 Views

Views will simplify reporting queries.

Example: A parking occupancy view showing total slots, occupied slots and available slots for each parking area.

### 8.4 Indexing

Indexes will improve frequently executed database queries.

Potential indexed attributes include:

- Vehicle registration number.
- Parking slot identifier.
- Driver identifier.
- Allocation timestamps.
- Violation identifiers.

Indexes should be selected based on actual query patterns.

### 8.5 Stored Functions

PostgreSQL stored functions can implement reusable database operations.

Example: Calculating parking charges using check-in time, check-out time and hourly parking rate.

Each advanced feature must be implemented, tested and documented. These are planned features until their implementation is verified.

---

## 9. Authentication and Authorization

The application will support at least two user roles.

### Admin

The administrator may:

- Manage parking areas and slots.
- Manage drivers and vehicles.
- View system-wide parking information.
- Access reports.
- Manage relevant system records.

### Parking Staff

Parking staff may:

- View parking availability.
- Perform parking allocations.
- Record vehicle check-in and check-out.
- Record violations.
- Process relevant payments.
- Issue notices.

The exact permission boundaries will be finalized during implementation.

Security requirements:

- Passwords must be hashed.
- Sensitive credentials must be stored in environment variables.
- Protected API routes must validate authorization server-side.
- User input must be validated.
- SQL queries must use parameterized statements.

---

## 10. Team Responsibilities

The work is divided between two members to ensure that both contribute to database development and application development.

### Member A — Syed Obaid Faraz

**Primary ownership: Core Parking Management and Allocation**

Responsibilities:

**Database Development**
- PostgreSQL database setup.
- Core relational schema.
- PARKING_AREA implementation.
- PARKING_SLOT implementation.
- DRIVER implementation.
- DRIVER_PHONE implementation.
- VEHICLE implementation.
- ALLOCATION implementation.
- Related primary keys, foreign keys and constraints.

**Backend Development**
- Parking area APIs.
- Parking slot APIs.
- Driver and vehicle APIs.
- Parking allocation APIs.
- Check-in/check-out operations.
- Slot availability logic.
- Allocation transaction handling.

**Frontend Development**
- Main dashboard.
- Parking area management pages.
- Parking slot management pages.
- Driver and vehicle management pages.
- Parking allocation interface.
- Occupancy information.

**Testing and Documentation**
- Allocation tests.
- Slot availability tests.
- Occupancy queries.
- Related SQL documentation.
- Dashboard screenshots.

### Member B — Suryatej V

**Primary ownership: Violation Management, Payments and MongoDB Integration**

Responsibilities:

**Database Development**
- VIOLATION implementation.
- VIOLATION_PAYMENT implementation.
- PAYMENT implementation, coordinated with Member A.
- NOTICE implementation.
- Relevant primary keys, foreign keys and constraints.
- Violation and payment-related SQL queries.

**MongoDB Development**
- MongoDB connection and configuration.
- Audit-log collection.
- Violation activity logging.
- Payment activity logging.
- Notice activity logging.
- Relevant MongoDB indexes.
- Audit-event retrieval.

**Backend Development**
- Violation APIs.
- Payment APIs.
- Violation payment history.
- Notice APIs.
- Violation status management.
- Payment validation and processing.
- MongoDB audit-event integration.

**Frontend Development**
- Violation management interface.
- Violation creation forms.
- Violation details and history.
- Payment interface.
- Payment history.
- Notice management interface.
- Violation and payment-related reports.

**Testing and Documentation**
- Violation tests.
- Payment tests.
- Validation and authorization tests.
- MongoDB audit-log tests.
- Violation and payment SQL documentation.
- Screenshots of implemented features.

### Shared Responsibilities

Both members will collaborate on:

- Finalizing the database schema.
- Authentication and role-based access.
- API integration.
- Database integrity.
- Application integration.
- Advanced DBMS concepts.
- End-to-end testing.
- README and final documentation.
- Final project demonstration.

Each member must make meaningful Git commits corresponding to their actual contributions.

Neither member should overwrite or independently redesign the other member's assigned functionality without discussion.

---

## 11. Software Prerequisites

The development environment requires the following software.

| Software | Purpose | Official Download |
|---|---|---|
| Visual Studio Code | Code editor | https://code.visualstudio.com/ |
| Node.js LTS | JavaScript runtime and npm | https://nodejs.org/ |
| Git for Windows | Version control | https://git-scm.com/downloads/win |
| PostgreSQL | Relational database | https://www.postgresql.org/download/windows/ |
| pgAdmin 4 | PostgreSQL GUI | Included in the PostgreSQL installer |
| MongoDB Community Server | NoSQL database | https://www.mongodb.com/try/download/community |
| MongoDB Compass | MongoDB GUI | https://www.mongodb.com/try/download/compass |
| GitHub Account | Repository collaboration | https://github.com/ |

Python, Docker and a separate Express server are not required for the proposed implementation.

---

## 12. Repository Structure

The intended project structure is:

```text
smart-parking-allocation-system/
│
├── src/
│   ├── app/
│   │   ├── login/
│   │   ├── dashboard/
│   │   ├── parking/
│   │   ├── allocations/
│   │   ├── violations/
│   │   ├── payments/
│   │   ├── notices/
│   │   ├── reports/
│   │   └── api/
│   │
│   ├── components/
│   └── lib/
│
├── database/
│   ├── schema.sql
│   ├── seed.sql
│   ├── advanced_features.sql
│   └── queries.sql
│
├── docs/
│   ├── problem-statement.md
│   ├── architecture.md
│   ├── data-dictionary.md
│   ├── database-justification.md
│   ├── test-cases.md
│   ├── screenshots/
│   └── er-diagram/
│
├── tests/
│
├── public/
├── .env.example
├── .gitignore
├── README.md
├── package.json
├── package-lock.json
└── next.config.ts
```

This is the intended structure and may evolve as implementation progresses.

Do not create unnecessary empty files or folders merely to match this tree.

---

## 13. Environment Configuration

Database credentials and application secrets must be kept outside source code.

The project will use an `.env.local` file for local development.

Example:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/smart_parking

MONGODB_URI=mongodb://localhost:27017

MONGODB_DB=smart_parking_logs

JWT_SECRET=YOUR_LONG_RANDOM_SECRET
```

An `.env.example` file containing placeholders should be committed to GitHub.

The actual `.env.local` must never be committed.

The PostgreSQL username, password, port and database name should match the local installation.

---

## 14. Getting Started

### Step 1: Clone the Repository

```bash
git clone https://github.com/obaidfaraz/Smart-Parking-Allocation-System.git

cd Smart-Parking-Allocation-System
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

Create `.env.local` in the project root using the configuration described above.

### Step 4: Start PostgreSQL

Ensure the PostgreSQL service is running.

Create the project database:

```sql
CREATE DATABASE smart_parking;
```

The database schema and sample data will be loaded using the project's SQL scripts once they are implemented.

### Step 5: Start MongoDB

Ensure MongoDB Community Server is running locally, or configure the connection string for the team's selected MongoDB deployment.

### Step 6: Run the Application

```bash
npm run dev
```

Open:

http://localhost:3000

### Other Commands

```bash
npm run build
npm run start
npm run lint
```

The application requires both database services to be available for full functionality.

---

## 15. Git and Collaboration Workflow

The project uses Git and GitHub for collaborative development.

Repository:

https://github.com/obaidfaraz/Smart-Parking-Allocation-System

Each team member must use their own GitHub account and work through the shared repository.

### Before Starting a New Feature

```bash
git status
git fetch origin --prune
git branch -vv
git branch -a
```

Check the current integration branch and create a feature branch according to the team's agreed workflow.

Do not assume that a `dev` branch exists.

### Example Feature Branches

```text
feat/parking-allocation
feat/parking-dashboard
feat/violation-management
feat/payment-management
feat/mongodb-audit-logs
```

### Commit Convention

Use descriptive commit messages.

Examples:

```text
chore: initialize Next.js application

feat(db): implement parking database schema

feat(parking): implement slot allocation API

feat(violations): implement violation management API

feat(payments): implement payment processing

feat(audit): integrate MongoDB audit logging

feat(ui): implement violation management interface

test(parking): add allocation test cases

docs: update project documentation
```

Only commit work that you have actually implemented.

Before pushing, review the staged changes:

```bash
git status
git diff --cached
```

Then:

```bash
git commit -m "your descriptive commit message"

git push
```

Never overwrite another team member's work or discard uncommitted changes without checking first.

---

## 16. Testing Strategy

Testing will cover database integrity, backend functionality and frontend integration.

### Database Testing

- Verify primary and foreign key constraints.
- Test invalid and duplicate records.
- Test allocation consistency.
- Verify payment relationships.
- Test triggers and stored functions.
- Verify indexes and views.
- Test transactions and rollback behavior.

### Backend Testing

- Valid and invalid API requests.
- Database connection failures.
- Invalid identifiers.
- Duplicate allocations.
- Invalid payments.
- Unauthorized requests.
- MongoDB logging.

### Frontend Testing

- Authentication and navigation.
- Form validation.
- Parking availability display.
- Allocation workflows.
- Violation creation.
- Payment recording.
- Report generation.
- Error and success messages.

Actual test results should be documented in the final submission.

---

## 17. Final Deliverables

The final repository and submission should include:

1. Complete Next.js application source code.
2. PostgreSQL database schema.
3. SQL sample data and important queries.
4. MongoDB database integration.
5. ER diagram.
6. Relational schema.
7. Advanced database implementations.
8. Authentication and role-based authorization.
9. Application screenshots.
10. System architecture documentation.
11. Data dictionary.
12. Test cases and testing results.
13. Complete README and setup instructions.
14. GitHub commit history showing both members' contributions.

The final demonstration should explain the problem, database design, application functionality, database integration, advanced DBMS concepts, test cases and individual contributions.

---

## 18. Future Enhancements

Potential improvements beyond the initial implementation include:

- IoT-based real-time parking occupancy detection.
- Automated vehicle number plate recognition.
- Mobile application integration.
- Predictive parking availability.
- Advanced analytics and revenue reports.
- Online payment gateway integration.
- Reservation and advance-booking functionality.

These are potential future enhancements and are not part of the guaranteed initial implementation scope.

---


**Smart Parking Allocation & Violation Management System**  
Developed as part of the DBMS Experiential Learning – Level 3 Project at PES University, Bengaluru.

**Team:** Syed Obaid Faraz and Suryatej V.
