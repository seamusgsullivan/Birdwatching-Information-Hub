let allResults = [];
let currentPage = 1;
// Default results per page, change if desired. If you change it, also update the 'selected' option in the results-per-page dropdown in search.html to match the new number
let resultsPerPage = 20;
// Used for displaying a message to the user if the results were limited. This should be the same as whatever it is in index.js 
const MAX_RESULTS_LIMIT = 1000;
const IS_LOCAL_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE_URL = IS_LOCAL_DEV ? 'http://localhost:3000' : '';     


const searchTypeSelect = document.getElementById("search-type");
const regionInput = document.getElementById("region");
const speciesInput = document.getElementById("species");
const searchButton = document.getElementById("search-btn");
const resultsPerPageSelect = document.getElementById("results-per-page");
const sightingsList = document.getElementById("sightings-list");
const paginationControls = document.getElementById("pagination-controls");
const recentSightingsTitle = document.getElementById("recent-sightings-title");
const paginationSettingsDiv = document.getElementById("pagination-settings");
const resultsMessageEl = document.getElementById('results-message');
const totalSearchesEl = document.getElementById('total-searches');
const mostSearchedBirdsEl = document.getElementById('most-searched-birds');


if (document.querySelector('.mySwiper')) {
    var swiper = new Swiper(".mySwiper", {
        loop: true,
        autoplay: {
            delay: 3000,
            disableOnInteraction: false,
        },
        pagination: {
            el: ".swiper-pagination",
            clickable: true,
        },
        navigation: {
            nextEl: ".swiper-button-next",
            prevEl: ".swiper-button-prev",
        },
    });
}


async function loadSearchStats() {
    if (!totalSearchesEl || !mostSearchedBirdsEl) {
        console.warn("Footer stat elements not found on this page.");
        return;
    }

    totalSearchesEl.textContent = 'Loading...';
    mostSearchedBirdsEl.textContent = 'Loading...';

    try {
        const response = await fetch(`${API_BASE_URL}/api/stats`);
        if (!response.ok) {
            const errData = await response.json().catch(() => ({ error: "Failed to parse error response" }));
            throw new Error(`Backend Error: ${errData.error || response.statusText}`);
        }
        const stats = await response.json();

        totalSearchesEl.textContent = stats.totalSearches ?? '0';

        if (stats.topBirds && stats.topBirds.length > 0) {
            const topBirdsString = stats.topBirds
                .map(bird => `${capitalizeWords(bird.species_name)} (${bird.count} ${bird.count === 1 ? 'search' : 'searches'})`)
                .join(', ');
            mostSearchedBirdsEl.textContent = topBirdsString;
        } else {
            mostSearchedBirdsEl.textContent = 'None yet';
        }

    } catch (error) {
        console.error("Error loading search stats from backend:", error);
        if (totalSearchesEl) totalSearchesEl.textContent = 'Error';
        if (mostSearchedBirdsEl) mostSearchedBirdsEl.textContent = 'Error';
    }
}


function capitalizeWords(string) {
    if (!string) return '';
    return string.split(' ').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}


if (searchButton) {

    searchTypeSelect.addEventListener("change", (e) => {
        if (speciesInput) {
            speciesInput.style.display = e.target.value === "specific" ? "inline-block" : "none";
            speciesInput.value = "";
        }
    });

    resultsPerPageSelect.addEventListener("change", (e) => {
        resultsPerPage = parseInt(e.target.value, 10);
        currentPage = 1;
        renderPage();
    });

    searchButton.addEventListener("click", async () => {
        const searchType = searchTypeSelect.value;
        const originalRegion = regionInput.value.trim();
        const originalSpecies = speciesInput.value.trim();

        if (!originalRegion) {
            alert("Please enter a region (US State or Country).");
            return;
        }
        if (searchType === "specific" && !originalSpecies) {
            alert("Please enter a species name for this search type.");
            return;
        }

        allResults = [];
        currentPage = 1;
        if (sightingsList) sightingsList.innerHTML = '<li>Loading results...</li>';
        if (paginationControls) paginationControls.innerHTML = "";
        if (paginationSettingsDiv) paginationSettingsDiv.style.display = 'none';
        if (recentSightingsTitle) recentSightingsTitle.style.display = "none";
        if (resultsMessageEl) resultsMessageEl.textContent = '';

        try {
            const regionCode = await getRegionCode(originalRegion.toLowerCase());
            if (!regionCode) {
                if (sightingsList) sightingsList.innerHTML = `<li>Could not find a valid region code for "${originalRegion}".</li>`;
                return;
            }

            let fetchedResults = [];
            let titleText = "";
            const proxyBaseUrl = `${API_BASE_URL}/api/ebird-data`;

            if (searchType === "notable") {
                titleText = `Recent Notable Sightings in ${originalRegion}`;
                const proxyUrl = `${proxyBaseUrl}?regionCode=${regionCode}&type=notable`;
                console.log("Calling backend proxy:", proxyUrl);
                const response = await fetch(proxyUrl);
                if (!response.ok) {
                    const errData = await response.json().catch(() => ({ error: 'Failed to parse error' }));
                    throw new Error(`Proxy Error (Notable): ${errData.error || response.statusText}`);
                }
                fetchedResults = await response.json();

            } else if (searchType === "specific" && originalSpecies) {
                titleText = `Recent Sightings of ${originalSpecies} in ${originalRegion}`;
                const speciesCodesArray = await getSpeciesCodes(originalSpecies.toLowerCase());
    
                if (!speciesCodesArray || speciesCodesArray.length === 0) {
                    if (sightingsList) {
                        sightingsList.innerHTML = `<li>Could not find any valid species codes for "${originalSpecies}".</li>`;
                    }

                    if (recentSightingsTitle) recentSightingsTitle.style.display = 'none';
                    if (paginationControls) paginationControls.innerHTML = '';
                    if (paginationSettingsDiv) paginationSettingsDiv.style.display = 'none';
                    if (resultsMessageEl) resultsMessageEl.textContent = '';
    
                    const statAttemptUrl = `${proxyBaseUrl}?regionCode=${regionCode}&type=specific&originalSpecies=${encodeURIComponent(originalSpecies)}`;
                    console.log("[CLIENT] Calling backend proxy for stat attempt (no codes found / invalid species):", statAttemptUrl);
                    
                    fetch(statAttemptUrl)
                        .catch(e => console.warn("[CLIENT] Backend call for invalid species failed or had no effect:", e))
                        .finally(() => {
                            loadSearchStats(); 
                        });
                    return;
                }
    
                const speciesCodesString = speciesCodesArray.join(',');
                const proxyUrl = `${proxyBaseUrl}?regionCode=${regionCode}&type=specific&speciesCodes=${speciesCodesString}&originalSpecies=${encodeURIComponent(originalSpecies)}`;

                console.log(`[CLIENT] Calling backend proxy for multiple species. URL: ${proxyUrl}`); 
    
                const response = await fetch(proxyUrl);
                if (!response.ok) {
                    const errData = await response.json().catch(() => ({ error: 'Failed to parse error' }));
                    throw new Error(`Proxy Error (Specific Species): ${errData.error || response.statusText}`);
                }
                fetchedResults = await response.json();

            } else {
                titleText = `Recent Sightings in ${originalRegion}`;
                const proxyUrl = `${proxyBaseUrl}?regionCode=${regionCode}&type=all`;
                console.log("Calling backend proxy:", proxyUrl);
                const response = await fetch(proxyUrl);
                if (!response.ok) {
                    const errData = await response.json().catch(() => ({ error: 'Failed to parse error' }));
                    throw new Error(`Proxy Error (All): ${errData.error || response.statusText}`);
                }
                fetchedResults = await response.json();
            }

            console.log(`Received ${fetchedResults.length} Results from proxy`);

            fetchedResults.sort((a, b) => {
                const dateA = new Date(a.obsDt);
                const dateB = new Date(b.obsDt);
                if (isNaN(dateA) && isNaN(dateB)) return 0;
                if (isNaN(dateA)) return 1;
                if (isNaN(dateB)) return -1;
                return dateB - dateA;
            });

            
            allResults = fetchedResults;

            if (resultsMessageEl) {
                if (allResults.length === MAX_RESULTS_LIMIT) {
                    resultsMessageEl.textContent = `Displaying the ${MAX_RESULTS_LIMIT} most recent results.`;
                } else {
                    resultsMessageEl.textContent = '';
                }
            }

            if (recentSightingsTitle) {
                recentSightingsTitle.textContent = titleText;
                recentSightingsTitle.style.display = 'block';
            }

            renderPage();
            loadSearchStats();

        } catch (error) {
            console.error("Error during search:", error);
            if (sightingsList) sightingsList.innerHTML = `<li>An error occurred: ${error.message}. Please try again.</li>`;
            if (recentSightingsTitle) recentSightingsTitle.style.display = 'none';
            if (paginationSettingsDiv) paginationSettingsDiv.style.display = 'none';
            if (resultsMessageEl) resultsMessageEl.textContent = '';
            if (paginationControls) paginationControls.innerHTML = "";
        }
    });



    async function getRegionCode(regionName) {
        try {
            const countryProxyUrl = `${API_BASE_URL}/api/ebird-ref?refType=region&regionType=country&countryCode=world`;
            const countryResponse = await fetch(countryProxyUrl);
            if (!countryResponse.ok) throw new Error(`Proxy region error (Countries): ${countryResponse.statusText}`);
            const countries = await countryResponse.json();
            const country = countries.find((c) => c.name.toLowerCase() === regionName);
            if (country) return country.code;

            const stateProxyUrl = `${API_BASE_URL}/api/ebird-ref?refType=region&regionType=subnational1&countryCode=US`;
            const stateResponse = await fetch(stateProxyUrl);
            if (!stateResponse.ok) throw new Error(`Proxy region error (States): ${stateResponse.statusText}`);
            const states = await stateResponse.json();
            const state = states.find((s) => s.name.toLowerCase() === regionName);
            return state ? state.code : null;

        } catch (error) {
            console.error("Error fetching region code via proxy:", error);
            return null;
        }
    }

   
    async function getSpeciesCodes(speciesName) {
        const searchTerm = speciesName.trim();
        if (!searchTerm) return [];
    
        if (!window.eBirdTaxonomy) {
            console.log("[CLIENT] Fetching eBird taxonomy via proxy...");
            try {
                const proxyUrl = `${API_BASE_URL}/api/ebird-ref?refType=taxonomy`;
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`Proxy taxonomy error: ${response.statusText}`);
                const text = await response.text();
    
                const rawLines = text.split("\n");
                window.eBirdTaxonomy = rawLines.slice(1)
                    .map((row) => {
                        if (!row.trim()) return null;
                        const columns = row.split(',');
                        if (columns.length < 4) return null;
                        const birdData = {
                            sciName:  columns[0]?.trim().replace(/"/g, ''),
                            comName:  columns[1]?.trim().replace(/"/g, '').toLowerCase(),
                            code:     columns[2]?.trim().replace(/"/g, ''),
                            category: columns[3]?.trim().replace(/"/g, ''),
                        };
                        if (!birdData.code || !birdData.comName) return null;
                        return birdData;
                    }).filter(Boolean);
                console.log(`[CLIENT] Taxonomy loaded. Entries: ${window.eBirdTaxonomy.length}`);
            } catch (error) {
                console.error("[CLIENT] Error fetching/parsing taxonomy via proxy:", error);
                window.eBirdTaxonomy = []; return [];
            }
        } else { console.log("[CLIENT] Using cached eBird taxonomy."); }
    
        if (!window.eBirdTaxonomy) return [];
    
        console.log(`[CLIENT] Filtering taxonomy for names matching '${searchTerm}'`);
        const speciesCodesResult = window.eBirdTaxonomy
            .filter(bird => {
                if (!bird.comName) return false;
                if (bird.comName === searchTerm) return true;
                const commonNameWords = bird.comName.split(' ');
                return commonNameWords.includes(searchTerm);
            })
            .map(bird => bird.code);
    
        console.log(`[CLIENT] Species codes for '${searchTerm}':`, speciesCodesResult);
        return speciesCodesResult;
    }

    
    function renderPage() {
        if (!sightingsList || !paginationControls || !paginationSettingsDiv) return;

        sightingsList.innerHTML = "";

        if (!Array.isArray(allResults) || allResults.length === 0) {
            sightingsList.innerHTML = "<li>No recent sightings found matching your criteria.</li>";
            paginationControls.innerHTML = "";
            paginationSettingsDiv.style.display = 'none';
            if (resultsMessageEl) resultsMessageEl.textContent = '';
            return;
        }

        paginationSettingsDiv.style.display = 'flex';

        const startIndex = (currentPage - 1) * resultsPerPage;
        const endIndex = Math.min(startIndex + resultsPerPage, allResults.length);
        const pageResults = allResults.slice(startIndex, endIndex);

        pageResults.forEach((sighting) => {
            const listItem = document.createElement("li");
            let formattedDate = "Date Unknown";
            
            if (sighting.obsDt && typeof dayjs === 'function') {
                const dateObj = dayjs(sighting.obsDt);
                if (dateObj.isValid()) {
                    formattedDate = dateObj.format('MMMM D, YYYY h:mm A');
                }
            }

            const commonName = sighting.comName || "N/A";
            const sciName = sighting.sciName || "N/A";
            const locName = sighting.locName || "Location Unknown";
            const howMany = sighting.howMany || "Not specified";

            listItem.innerHTML = `
                <strong>${commonName}</strong> (${sciName})<br>
                Location: ${locName}<br>
                Observed: ${formattedDate}<br>
                Count: ${howMany}
            `;
            sightingsList.appendChild(listItem);
        });

        updatePaginationControls();
    }


    function updatePaginationControls() {
        if (!paginationControls) return;
        paginationControls.innerHTML = "";

        const totalPages = Math.ceil(allResults.length / resultsPerPage);
        if (totalPages <= 1) return;

        const prevButton = document.createElement("button");
        prevButton.textContent = "Previous";
        prevButton.disabled = currentPage === 1;
        prevButton.addEventListener("click", () => {
            if (currentPage > 1) {
                currentPage--;
                renderPage();
                if (recentSightingsTitle) window.scrollTo(0, recentSightingsTitle.offsetTop);
            }
        });
        paginationControls.appendChild(prevButton);

        const pageInfo = document.createElement("span");
        pageInfo.textContent = ` Page ${currentPage} of ${totalPages} `;
        paginationControls.appendChild(pageInfo);

        const nextButton = document.createElement("button");
        nextButton.textContent = "Next";
        nextButton.disabled = currentPage === totalPages;
        nextButton.addEventListener("click", () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderPage();
                if (recentSightingsTitle) window.scrollTo(0, recentSightingsTitle.offsetTop);
            }
        });
        paginationControls.appendChild(nextButton);
    }

    if (searchTypeSelect && searchTypeSelect.value !== "specific" && speciesInput) {
        speciesInput.style.display = "none";
    }
    if (paginationSettingsDiv) {
        paginationSettingsDiv.style.display = 'none';
    }

}

document.addEventListener('DOMContentLoaded', loadSearchStats);
