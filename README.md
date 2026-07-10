# Orbital Surveillance Network (OSN): Core Backend for Space Situational Awareness

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Drizzle ORM](https://img.shields.io/badge/Drizzle%20ORM-F97316?style=for-the-badge&logo=drizzle&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white)

![Conceptual Orbital Surveillance Network (OSN) Interface](docs/osn-mockup.png)
_**(Note: This image is a conceptual placeholder for a future 3D globe and HUD interface. An actual visual asset will be added.)**_

## 🚀 Acquire the Core Intelligence Engine for Space Traffic Control

The **Orbital Surveillance Network (OSN)** project offers the foundational intelligence engine for advanced space traffic control and situational awareness. This robust backend system is meticulously engineered to provide real-time tracking and critical conjunction analysis of Low Earth Orbit (LEO) objects, empowering the development of next-generation space monitoring platforms.

Built with TypeScript and Express.js, OSN efficiently integrates and processes Two-Line Element (TLE) data from CelesTrak, automatically identifying potential close-approach events and collision threats. It serves as a specialized, high-performance core for applications requiring precise orbital mechanics data and predictive analysis, offering a significant head start on complex space domain challenges.

## ✨ Key Features

*   **Real-time Satellite Tracking:** Ingests and processes current TLE data to calculate and track the positions of LEO objects.
*   **Automated Conjunction Analysis:** Identifies potential close-approach events between satellites, providing early warnings for collision avoidance.
*   **CelesTrak Data Integration:** Seamlessly fetches and updates TLE data directly from CelesTrak sources.
*   **Scalable Express.js API:** A performant and well-structured API designed for real-time data access and analysis, ready for integration into various frontends.
*   **Full-Stack Monorepo (pnpm):** Organized with `pnpm` for streamlined development across the backend API and frontend components.
*   **TypeScript End-to-End:** Ensures type safety and enhanced developer experience across the entire codebase.
*   **Modular Architecture:** Designed for extensibility, allowing easy integration of new orbital data sources or analytical modules.

## 🏛️ Architecture Overview

OSN is structured as a pnpm monorepo, delineating responsibilities across specialized packages:

*   **`artifacts/api-server`**: The heart of the OSN, this Express.js backend API is responsible for TLE data fetching, processing, satellite tracking calculations, and conjunction analysis. It serves the core intelligence to potential client applications.
*   **`artifacts/mockup-sandbox`**: A React-based frontend application serving as a sandbox for developing and showcasing UI components. While not the primary OSN frontend, it provides a rich toolkit for building responsive user interfaces that could consume the OSN API.
*   **`artifacts/orion` (Planned)**: This package is intended to house the primary OSN frontend application – a 3D interactive globe with a Heads-Up Display (HUD) for visualizing space objects and conjunction events. *This component is currently undeveloped and represents a future enhancement.*
*   **`lib/db`**: A shared library for database interactions, pre-configured with Drizzle ORM for type-safe data management. *The specific database schema for OSN space objects and conjunction events is currently a placeholder, awaiting implementation.*

```mermaid
graph TD
    A[Client Application<br>(e.g., Planned 3D Globe)] -->|HTTP/REST API Calls| B(OSN API Server<br>artifacts/api-server)
    B -->|Fetch External Data| C[CelesTrak (TLE Data)]
    B -->|Database Interactions| D[lib/db<br>(Drizzle ORM)]
    D -->|SQL Operations| E(PostgreSQL Database)

    subgraph UI Component Development
        F[React UI Sandbox<br>artifacts/mockup-sandbox]
    end
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

Follow these steps to set up and run the **OSN API Server** on your local machine.

### Prerequisites

*   Node.js (LTS version recommended)
*   pnpm
*   Docker (for easily running PostgreSQL, or a local PostgreSQL instance)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/AIandu/Galactic.git
    cd Galactic
    ```
2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

### Database Setup (PostgreSQL)

1.  **Start PostgreSQL:** If using Docker, you can run:
    ```bash
    docker run --name osn-postgres -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=osn_db -p 5432:5432 -d postgres:16
    ```
    Ensure you have `osn_db` created and accessible with the configured user/password.
2.  **Configure Environment Variables:** Create a `.env` file in the `artifacts/api-server` directory (or your project root, depending on your `.env` loading strategy) with your database connection string, for example:
    ```
    DATABASE_URL="postgresql://user:password@localhost:5432/osn_db"
    ```

### Running the OSN API Server

1.  **Navigate to the API server directory:**
    ```bash
    cd artifacts/api-server
    ```
2.  **Start the server:**
    ```bash
    pnpm dev
    ```
    The API server should now be running, typically on `http://localhost:3000`.

### Running the UI Mockup Sandbox

1.  **Navigate to the mockup sandbox directory:**
    ```bash
    cd artifacts/mockup-sandbox
    ```
2.  **Start the development server:**
    ```bash
    pnpm dev
    ```
    The UI component sandbox will be available in your browser, typically on `http://localhost:5173`.
