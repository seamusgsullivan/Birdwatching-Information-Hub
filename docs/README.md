# Birdwatching Information Hub

## Project Description

The Birdwatching Information Hub is a web application designed to make birdwatching more accessible and engaging for everyone. It allows users to search for recent bird sightings by location (country or US state) and/or by species name. The application fetches near real-time observation data from the eBird API, processes it through a custom backend server, and displays it in a user-friendly format with pagination. Key features include searching for all recent sightings, notable (rare or unusual) sightings, and specific species. The site also tracks and displays usage statistics, such as total searches performed and the most frequently searched bird species.

This project was created by Seamus Sullivan as the final project for INST377.

## Target Browsers

This application is designed to be responsive and function correctly on contemporary desktop web browsers, including the latest versions of:

* Google Chrome
* Mozilla Firefox
* Microsoft Edge
* Apple Safari

The website layout aims to be flexible for various screen sizes, including mobile devices, but the primary focus for testing and optimization has been on desktop browsers. While specific versions of iOS Safari or Android Chrome have not been extensively tested, general compatibility with common mobile browsers is expected since the site uses standard web technologies.

## Link to Developer Manual

[Developer Manual](#developer-manual) (Scroll down or click this link)

---
---

## Developer Manual

This manual explains how the Birdwatching Information Hub application is built and how to set it up for further development. It is intended for developers who have general knowledge of web basics (HTML, CSS, JavaScript, Node.js) but are new to this specific project.

### 1. System Overview

The Birdwatching Information Hub has two main parts:

* **Frontend:** This is what users see and interact with in their web browser. It includes:
    * HTML files (`home.html`, `search.html`, `about.html`, `help.html`) for the page structure.
    * CSS (`styles.css`) for styling the appearance of the pages.
    * Client-side JavaScript (`scripts.js`) for interactive features, such as the image slider (using Swiper.js) and date formatting (using Day.js).
    * Important: The frontend does not directly request data from eBird or the project's database, instead, it communicates with the backend server.

* **Backend:** This is a server built with Node.js and the Express framework (in the `index.js` file). Its primary functions are:
    * To act as a secure intermediary for the eBird API, which helps keep the eBird API key safe.
    * To connect to a Supabase (PostgreSQL) database where simple statistics are stored (e.g., total search counts and most frequently searched bird species).

A `.env` file is used on local computers to store secret keys (like the eBird API key and Supabase connection details). When the project is deployed (e.g., to Vercel), these secrets are configured as "environment variables" in the hosting platform's settings.

### 2. Setting Up Locally

#### 2.1. What You'll Need

* **Node.js and npm:** Node.js (the LTS version is recommended) and npm (which comes with Node.js) are required. They can be downloaded from [https://nodejs.org/](https://nodejs.org/).
* **Git:** For cloning the project repository from GitHub.
* **Supabase Account & Project:** A Supabase account ([Supabase.com](https://supabase.com/)) and a new project are necessary.
* **eBird API Key:** A personal API key from eBird is needed to fetch bird data. To obtain one:
    1.  Go to the eBird data download and API access page: [https://ebird.org/data/download](https://ebird.org/data/download)
    2.  On that page, find the "eBird API" section.
    3.  Click the "Request access" button next to the eBird API information and follow the instructions provided by eBird. An eBird account will likely be required.

#### 2.2. Installation

1.  **Get the Code:**
    Open a terminal, navigate to the desired directory for projects, and run:
    ```bash
    git clone [https://github.com/seamusgsullivan/Birdwatching-Information-Hub.git](https://github.com/seamusgsullivan/Birdwatching-Information-Hub.git)
    cd Birdwatching-Information-Hub
    ```

2.  **Install Project Dependencies:**
    In the terminal, from the project's root folder, run:
    ```bash
    npm install
    ```
    This installs the necessary packages listed in `package.json` for the backend (like Express, cors, dotenv, @supabase/supabase-js) and development tools (like `nodemon`, which is listed as a devDependency).

3.  **Set up the Supabase Database:**
    * Go to the Supabase project dashboard.
    * Navigate to the **Table Editor**.
    * For the tables detailed below, ensure **Row Level Security (RLS) is turned OFF**.
    * Create two tables:
        * **Table 1: `search_stats`** (stores total search counts)
            * Columns:
                * `id`: `int8` (Primary Key, auto-generated by Supabase).
                * `stat_name`: `text` (Set as **Is Unique** and **Is Not Nullable**). Stores identifiers like 'total_searches'.
                * `count`: `int8` (Set as **Is Not Nullable**, with a Default value of `0`).
            * Initial Data: Manually add one row to this table using the Supabase UI: `stat_name = 'total_searches'`, `count = 0`.
        * **Table 2: `bird_searches`** (stores counts of how often individual birds are searched)
            * Columns:
                * `id`: `int8` (Primary Key, auto-generated by Supabase).
                * `species_name`: `text` (Set as **Is Unique** and **Is Not Nullable**). Stores the bird's common name in lowercase.
                * `count`: `int8` (Set as **Is Not Nullable**, with a Default value of `1`).
    * The backend application (`index.js`) interacts with these tables using JavaScript client methods to update the statistics.

4.  **Create the Secret `.env` File:**
    In the main project folder, create a new file named exactly `.env`. Add the necessary secret keys:
    ```env
    # Local Environment Variables - This file should be added to .gitignore!
    SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL_HERE
    SUPABASE_KEY=YOUR_SUPABASE_PROJECT_ANON_KEY_HERE
    EBIRD_API_KEY=YOUR_EBIRD_API_KEY_HERE
    ```
    * Replace the `YOUR_..._HERE` placeholders with the actual values. The Supabase URL and "anon key" can be found in the Supabase project settings (usually under "Project Settings" -> "Data API").

#### 2.3. Running the Application Locally

1.  **Start the Backend Server:**
    Open a terminal in the project folder and type:
    ```bash
    npm run dev
    ```
    This command uses `nodemon` to start the `index.js` server, which typically listens on `http://localhost:3000`. `nodemon` will automatically restart the server upon detecting file changes in the backend code. Monitor the terminal for messages indicating the server has started successfully.

2.  **View the Frontend:**
    * Open any of the HTML files (e.g., `home.html`, `search.html`) in a web browser.
    * **Recommended Method:** If using VS Code, install the "Live Server" extension. Right-click on an HTML file (like `home.html`) in the file explorer and choose "Open with Live Server." This usually serves the page from an address like `http://127.0.0.1:5500`.
    * The displayed web pages will then retrieve data by making requests to the backend server running at `http://localhost:3000`.

#### 2.4. Testing

Currently, the project does not include automated tests. Testing should be performed manually by interacting with the website's features in a browser and observing the behavior.

### 3. Server API Endpoints (Defined in `index.js`)

The backend server (`index.js`) provides several API endpoints that the frontend uses. When the application is deployed (e.g., on Vercel), the frontend will call these using relative paths (e.g., `/api/stats`). For local development, the `scripts.js` file is configured to use `http://localhost:3000` as the base URL for these API calls.

* **`GET /api/stats`**
    * **Purpose:** Retrieves current search statistics (total overall searches and the top 5 most searched bird species) from the Supabase database.
    * **Returns:** JSON data. Example:
        ```json
        {
          "totalSearches": 125,
          "topBirds": [
            { "species_name": "american robin", "count": 15 },
            { "species_name": "house sparrow", "count": 12 }
            // ... up to 5 birds
          ]
        }
        ```

* **`GET /api/ebird-ref`**
    * **Purpose:** Fetches reference data from eBird, such as the complete bird species list (taxonomy) or lists of geographical regions. The server uses the `eBirdAPIKey` for these requests.
    * **Required by Frontend (Query Parameters):**
        * `refType`: Specifies the type of reference data needed (either `taxonomy` or `region`).
        * `regionType`: If `refType` is `region`, this specifies the kind of region list (e.g., `country`, `subnational1` for US states).
        * `countryCode`: If `refType` is `region`, this specifies the parent country code (e.g., `US` for states, or `world` for a list of all countries).
    * **Returns:** CSV formatted text for `taxonomy`; JSON formatted data for `region` lists.

* **`GET /api/ebird-data`**
    * **Purpose:** Fetches recent bird sighting data from eBird. The server uses the `eBirdAPIKey`. After successfully retrieving data, it also triggers an update to the statistics in the Supabase database.
    * **Required by Frontend (Query Parameters):**
        * `regionCode`: The eBird code for the geographical area to search (e.g., `US-NY`, `DE`).
        * `type`: The type of search to perform (`all`, `notable`, or `specific`).
        * `speciesCodes` (for `type=specific`): A comma-separated string of eBird species codes.
        * `originalSpecies` (for `type=specific`): The bird name the user originally typed. This is used for updating search statistics if the search is valid.
    * **eBird Parameters Used by Server & Result Processing:** For all observation data requests, the server requests data from the eBird API for sightings within the last `30` days (using eBird's `back=30` parameter).
        * For "All Sightings" or "Notable Sightings" searches, the server fetches the available recent observations for the specified region from eBird.
        * For "Specific Species" searches, if the user's input matches one or more eBird species codes, the server fetches recent observations for each of these codes and then combines them into a single list.
      Regardless of the search type, once this complete set of observations is retrieved by the server, it is sorted by date (most recent first). Finally, this sorted list is limited to the newest `MAX_RESULTS_LIMIT` (a constant defined in `index.js`, currently 1000) before being sent to the frontend.
    * **Returns:** An array of eBird observation data objects (up to 1000), or an empty array if no sightings are found or an error occurs.

### 4. Known Issues & Future Ideas

#### 4.1. Current Limitations

* **Statistic Counter Updates:** If many users perform searches at nearly the exact same moment, the current method of updating search counts in the database (reading the existing count, then writing an updated value) could occasionally result in minor inaccuracies in the totals. For the expected usage of this application, this is generally acceptable.
* **Species List (Taxonomy) Caching:** The list of bird species used for matching user input is fetched from eBird when a user first needs it during their session and is then temporarily stored in their browser. If eBird updates its official taxonomy (typically once a year), a user would need to start a new browser session (e.g., by closing and reopening the tab or browser, or clearing cache) to ensure they are using the absolute latest list.
* **External API Dependency:** The application's functionality is dependent on the availability and responsiveness of the eBird API. If the eBird API is slow or temporarily unavailable, the application's search features will be impacted.

#### 4.2. Ideas for Future Improvements

* **User Accounts:** Functionality could be added to allow users to create accounts for saving favorite searches or personal bird sighting lists.
* **Advanced Search Filters:** More detailed filtering options could be added to the search results page, such as filtering by a specific date within the 30-day window or by popular eBird "hotspot" locations.
* **Map View Integration:** Bird sightings could be displayed on an interactive map.
* **Detailed Bird Information Pages:** Bird names in search results could link to dedicated pages offering more detailed information about each species.
* **Automated Testing Suite:** A set of automated tests could be developed to ensure code reliability and help prevent new code changes from breaking existing features.
* **Backend Caching Strategy:** The backend could implement a caching system for frequently requested eBird data to improve response times for users and reduce the number of direct calls to the eBird API.
