# Galactic: The Full-Stack TypeScript Framework for Rapid Product Development

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Drizzle ORM](https://img.shields.io/badge/Drizzle%20ORM-F97316?style=for-the-badge&logo=drizzle&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white)

## 🚀 Accelerate Your Product Development with Galactic

**Galactic** is a meticulously engineered, full-stack TypeScript framework designed to significantly accelerate your application development lifecycle. This comprehensive pnpm monorepo provides a robust, pre-architected foundation, allowing you to bypass weeks of foundational setup and immediately focus your engineering efforts on building unique features and delivering value to your users.

Built for speed, scalability, and developer experience, Galactic integrates a modern TypeScript stack with best-in-class tools, offering a seamless path from idea to deployment.

## ✨ Key Features

*   **Monorepo Structure (pnpm):** Streamlined dependency management and code sharing across your backend API and frontend UI.
*   **Robust Express API:** A well-structured backend server written in TypeScript, featuring health routes, centralized logging, and an extensible architecture ready for your business logic.
*   **PostgreSQL & Drizzle ORM:** Integrated database layer using PostgreSQL with Drizzle ORM for type-safe, performant, and flexible data management (schema definition awaiting your customization).
*   **Rich React UI Component Library:** A comprehensive collection of pre-built, production-ready React UI components within the `mockup-sandbox`, providing a powerful toolkit for building beautiful and responsive user interfaces.
*   **TypeScript End-to-End:** Leverage the benefits of type safety and improved developer experience across the entire stack.
*   **Best Practices:** Implements modern development practices including structured routing, environment management, and modular design.

## 🏛️ Architecture Overview

Galactic is structured as a pnpm monorepo, dividing concerns into distinct packages:

*   **`artifacts/api-server`**: The Express.js backend API, responsible for handling requests, interacting with the database, and serving data.
*   **`artifacts/mockup-sandbox`**: The React frontend application, serving as a sandbox for UI components and a foundation for your user interface.
*   **`lib/db`**: A shared library for database interactions, housing Drizzle ORM configurations and schema definitions.

```mermaid
graph TD
    A[Client (Browser/Mobile)] -->|HTTP/REST| B(artifacts/api-server)
    B -->|Database Calls| C[lib/db]
    C -->|SQL| D(PostgreSQL Database)
    subgraph Frontend
        E[React App] --> F[UI Components]
    end
    subgraph Backend
        B --> G[API Routes]
        B --> H[Middleware]
        B --> I[Logging]
    end
    artifacts/mockup-sandbox --> E
    artifacts/api-server --> B
    lib/db --> C
```

## 🛠️ Technologies Used

*   **Runtime:** Node.js
*   **Package Manager:** pnpm
*   **Language:** TypeScript
*   **Backend:** Express.js
*   **Frontend:** React, Vite (for `mockup-sandbox`)
*   **Database:** PostgreSQL
*   **ORM:** Drizzle ORM
*   **UI Components:** A rich set of accessible and customizable UI components

## ⚡ Getting Started

Follow these steps to set up and run Galactic on your local machine.

### Prerequisites

*   Node.js (LTS version recommended)
*   pnpm
*   Docker (for easily running PostgreSQL, or a local PostgreSQL installation)

### 1. Clone the Repository

```bash
git clone https://github.com/AIandu/Galactic.git
cd Galactic
```

### 2. Install Dependencies

Use pnpm to install all project dependencies across the monorepo:

```bash
pnpm install
```

### 3. Database Setup (PostgreSQL)

Galactic uses PostgreSQL. You can run a PostgreSQL instance locally using Docker:

```bash
docker run --name galactic-db -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=galactic -p 5432:5432 -d postgres:16
```

Next, configure your database connection string. Create a `.env` file in the root of your project or within `artifacts/api-server` and `lib/db` as needed, adding your `DATABASE_URL` (e.g., `postgresql://user:password@localhost:5432/galactic`).

**Note:** The Drizzle ORM setup is in place, but an example schema and migration process need to be defined. Refer to the Drizzle ORM documentation for schema definition and migrations (`pnpm run db:generate`, `pnpm run db:push`).

### 4. Run the API Server

Navigate to the `api-server` package and start the backend:

```bash
pnpm --filter api-server dev
```

The API server will typically run on `http://localhost:3000` (or as configured).

### 5. Run the UI Sandbox

In a separate terminal, navigate to the `mockup-sandbox` package and start the frontend development server:

```bash
pnpm --filter mockup-sandbox dev
```

The frontend application will usually be available at `http://localhost:5173` (or as configured).

## 👨‍💻 Extending the Framework

Galactic is designed to be highly extensible. Here's how you can start building your application on top of this framework:

### Backend (`artifacts/api-server`)

1.  **Define Database Schemas:** Populate `lib/db/src/schema/index.ts` with your application's data models using Drizzle ORM. Follow Drizzle's documentation to define tables, relations, and types.
2.  **Generate Drizzle Migrations:** Once your schema is defined, generate migrations to apply changes to your PostgreSQL database.
3.  **Add New API Routes:** Create new route files in `artifacts/api-server/src/routes/` to handle specific business logic. Integrate these into `artifacts/api-server/src/app.ts`.
4.  **Implement Business Logic:** Develop services and controllers to encapsulate your application's core functionality.

### Frontend (`artifacts/mockup-sandbox`)

1.  **Build New Pages:** Create new React components and pages within `artifacts/mockup-sandbox/src/` to define your application's user interface.
2.  **Utilize UI Components:** Leverage the extensive collection of pre-built components from `artifacts/mockup-sandbox/src/components/ui/` to rapidly assemble your UI.
3.  **Integrate with API:** Use `fetch` or a client library (e.g., `axios`, `tanstack-query`) to connect your frontend with the `api-server`.

### Monorepo

To add new services or libraries, create new packages within the `artifacts/` or `lib/` directories and define them in the root `package.json` workspaces. This maintains the benefits of the monorepo structure.

## 🤝 Contribution

Contributions are welcome! If you have suggestions or want to improve Galactic, please feel free to open an issue or submit a pull request.

## 📄 License

This project is licensed under the MIT License.
