const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const eBirdAPIKey = process.env.EBIRD_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!eBirdAPIKey || !supabaseUrl || !supabaseKey) {
    console.error("FATAL ERROR: Missing required environment variables (eBirdAPIKey, supabaseUrl, supabaseKey). Check .env file or Vercel environment variables.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
const port = process.env.PORT || 3000;

// Maximum amount of results to be displayed, can be changed if desired
const MAX_RESULTS_LIMIT = 1000;

app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/api/stats', async (req, res) => {
    console.log("[SERVER] GET /api/stats received");
    try {
        const { data: totalData, error: totalError } = await supabase
            .from('search_stats')
            .select('count')
            .eq('stat_name', 'total_searches')
            .maybeSingle();

        if (totalError) throw totalError;

        const { data: topBirdsData, error: topBirdsError } = await supabase
            .from('bird_searches')
            .select('species_name, count')
            .order('count', { ascending: false })
            // Number of species to display in the footer, can be changed if desired 
            .limit(5);

        if (topBirdsError) throw topBirdsError;

        res.json({
            totalSearches: totalData?.count ?? 0,
            topBirds: topBirdsData || []
        });

    } catch (error) {
        console.error("[SERVER] Error fetching stats from Supabase:", error.message);
        res.status(500).json({ error: "Failed to fetch stats.", details: error.message });
    }
});


app.get('/api/ebird-ref', async (req, res) => {
    console.log("[SERVER] GET /api/ebird-ref received:", req.query);

    if (!eBirdAPIKey) {
        console.error("[SERVER] API key is missing, cannot fulfill eBird /ref request.");
        return res.status(500).json({ error: "Server API key not configured." });
    }

    const { refType, regionType, countryCode } = req.query;

    if (!refType) return res.status(400).json({ error: "Missing 'refType'." });

    let ebirdRefUrl = `https://api.ebird.org/v2/ref/`;

    if (refType === 'taxonomy') {
        ebirdRefUrl += 'taxonomy/ebird';
    } else if (refType === 'region') {
        if (!regionType) return res.status(400).json({ error: "Missing 'regionType'." });
        if (!countryCode) return res.status(400).json({ error: "Missing 'countryCode'." });
        ebirdRefUrl += `region/list/${regionType}/${countryCode}`;
    } else {
        return res.status(400).json({ error: "Invalid 'refType'." });
    }

    try {

        const headers = {
            'X-eBirdApiToken': eBirdAPIKey
        };
        
        console.log(`[SERVER] Calling eBird Ref: ${ebirdRefUrl}`);
        
        const ebirdResponse = await fetch(ebirdRefUrl, { headers });
        const responseBody = await ebirdResponse.text();

        if (!ebirdResponse.ok) {
            console.error(`[SERVER] eBird Ref Error (${ebirdResponse.status}): ${responseBody}`);
            return res.status(ebirdResponse.status).json({ error: `eBird Ref API Error: ${ebirdResponse.statusText}`, details: responseBody });
        }

        const contentType = ebirdResponse.headers.get('content-type') || (refType === 'taxonomy' ? 'text/csv' : 'application/json');
        console.log(`[SERVER] Success: Sending ${refType} data with Content-Type: ${contentType}`);
        res.set('Content-Type', contentType);
        res.send(responseBody);

    } catch (error) {
        console.error("[SERVER] Error fetching from eBird Ref API:", error.message);
        res.status(500).json({ error: "Internal server error fetching eBird ref data.", details: error.message });
    }
});


app.get('/api/ebird-data', async (req, res) => {
    console.log("[SERVER] GET /api/ebird-data received:", req.query);
    if (!eBirdAPIKey) return res.status(500).json({ error: "Server API key not configured." });

    const { regionCode, type, speciesCode, speciesCodes, originalSpecies } = req.query;

    if (!regionCode) return res.status(400).json({ error: "Missing 'regionCode'." });

    let fetchedResults = [];
    let speciesToRecordForStats = null;

    if (type === 'specific') {
        const codesToFetch = [];
        if (speciesCode) {
            codesToFetch.push(speciesCode);
        } else if (speciesCodes) {
            codesToFetch.push(...speciesCodes.split(',').filter(code => code.trim() !== ''));
        }

        if (codesToFetch.length === 0 && originalSpecies) {
            console.log(`[SERVER] Specific search for '${originalSpecies}' without valid speciesCode(s). Recording total attempt only.`);
            return res.json([]);
        }
        if (codesToFetch.length === 0) {
            return res.status(400).json({ error: "Missing 'speciesCode' or 'speciesCodes' for type=specific." });
        }

        speciesToRecordForStats = originalSpecies;

        fetchedResults = [];
        // Can decrease batchSize and/or increase delayBetweenBatches if any rate-limiting issues occur with the eBird API
        const batchSize = 10;
        const delayBetweenBatches = 500;

        for (let i = 0; i < codesToFetch.length; i += batchSize) {
            const batchOfCodes = codesToFetch.slice(i, i + batchSize);
            console.log(`[SERVER] Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(codesToFetch.length / batchSize)} for species codes...`);

            const batchPromises = batchOfCodes.map(async (code) => {
                const queryParams = new URLSearchParams({ back: '30' });
                let ebirdApiUrl = `https://api.ebird.org/v2/data/obs/${regionCode}/recent/${code}?${queryParams.toString()}`;
                console.log(`[SERVER] Calling eBird for species ${code}: ${ebirdApiUrl.split('?')[0]}?${queryParams.toString()}`);
                try {
                    const response = await fetch(ebirdApiUrl, { headers: { 'X-eBirdApiToken': eBirdAPIKey } });
                    const responseBody = await response.text();
                    if (!response.ok) {
                        console.warn(`[SERVER] eBird error for species ${code} (${response.status}): ${responseBody}. Skipping.`);
                        return [];
                    }
                    try {
                       return JSON.parse(responseBody);
                    } catch (parseErr) {
                       console.warn(`[SERVER] Failed to parse JSON for species ${code}. Body: ${responseBody}. Skipping.`);
                       return [];
                    }
                } catch (fetchError) {
                    console.warn(`[SERVER] Fetch failed for species ${code}: ${fetchError.message}. Skipping.`);
                    return [];
                }
            });

            try {
                const batchResultsArrays = await Promise.all(batchPromises);
                fetchedResults = fetchedResults.concat(batchResultsArrays.flat());
            } catch (batchProcessingError) {
                console.error("[SERVER] Error processing a batch of species code fetches:", batchProcessingError);
            }

            if (i + batchSize < codesToFetch.length) {
                console.log(`[SERVER] Batch processed. Waiting ${delayBetweenBatches}ms before next batch...`);
                await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
            }
        }

    } else if (type === 'all' || type === 'notable') {

        speciesToRecordForStats = null;

        let ebirdApiUrl = `https://api.ebird.org/v2/data/obs/${regionCode}/recent`;
        if (type === 'notable') ebirdApiUrl += '/notable';

        const queryParams = new URLSearchParams({ back: '30' });
        ebirdApiUrl += `?${queryParams.toString()}`;
        console.log(`[SERVER] Calling eBird Data (${type}): ${ebirdApiUrl.split('?')[0]}?${queryParams.toString()}`);

        try {
            const ebirdResponse = await fetch(ebirdApiUrl, { headers: { 'X-eBirdApiToken': eBirdAPIKey } });
            const responseBody = await ebirdResponse.text();
            if (!ebirdResponse.ok) {
                console.error(`[SERVER] eBird Data Error (${type}, ${ebirdResponse.status}): ${responseBody}`);
                return res.status(ebirdResponse.status).json({ error: `eBird API Error: ${ebirdResponse.statusText}`, details: responseBody });
            }
            try {
                fetchedResults = JSON.parse(responseBody);
            } catch (parseError) {
                console.error("[SERVER] Failed to parse eBird JSON response:", parseError, "Body:", responseBody);
                return res.status(500).json({ error: "Failed to parse eBird response", details: responseBody });
            }
        } catch (error) {
            console.error(`[SERVER] Error fetching from eBird Data API (${type}):`, error.message);
            return res.status(500).json({ error: "Internal server error fetching eBird data.", details: error.message });
        }
    } else {
        return res.status(400).json({ error: "Invalid search 'type'." });
    }

    console.log(`[SERVER] Combined ${fetchedResults.length} results before final sort/limit.`);

    fetchedResults.sort((a, b) => {
        const dateA = new Date(a.obsDt); const dateB = new Date(b.obsDt);
        if (isNaN(dateA) && isNaN(dateB)) return 0; if (isNaN(dateA)) return 1; if (isNaN(dateB)) return -1;
        return dateB - dateA;
    });

    let finalResults = fetchedResults;
    if (fetchedResults.length > MAX_RESULTS_LIMIT) {
        console.log(`[SERVER] Limiting final results from ${fetchedResults.length} to ${MAX_RESULTS_LIMIT}`);
        finalResults = fetchedResults.slice(0, MAX_RESULTS_LIMIT);
    }

    await updateSupabaseStats(speciesToRecordForStats);

    console.log(`[SERVER] Sending ${finalResults.length} processed records to client.`);
    res.json(finalResults);
});



async function incrementTotalSearches() {
    try {
        const { data, error: readError } = await supabase
            .from('search_stats')
            .select('count')
            .eq('stat_name', 'total_searches')
            .maybeSingle();

        if (readError) throw readError;

        const currentCount = data?.count ?? 0;
        const newCount = currentCount + 1;

        const { error: updateError } = await supabase
            .from('search_stats')
            .update({ count: newCount })
            .eq('stat_name', 'total_searches');

        if (updateError) throw updateError;

        console.log("[SERVER] Incremented total searches to:", newCount);

    } catch(error) {
        console.error("[SERVER] Error incrementing total searches:", error.message);
    }
}

async function incrementBirdSearch(speciesName) {
    if (!speciesName) { console.log("[SERVER] JS: No speciesName for incrementBirdSearch."); return; }
    const normalizedSpecies = speciesName.trim().toLowerCase();
    if (!normalizedSpecies) { console.log("[SERVER] JS: Empty normalizedSpecies."); return; }

    try {
        const { data: existing, error: readError } = await supabase
            .from('bird_searches')
            .select('id, count')
            .eq('species_name', normalizedSpecies)
            .maybeSingle();

        if (readError) throw readError;

        if (existing) {
            const newCount = existing.count + 1;
            const { error: updateError } = await supabase
                .from('bird_searches')
                .update({ count: newCount })
                .eq('id', existing.id);

            if (updateError) throw updateError;
            console.log(`[SERVER] Incremented search count for '${normalizedSpecies}' to:`, newCount);

        } else {
            const { error: insertError } = await supabase
                .from('bird_searches')
                .insert({ species_name: normalizedSpecies, count: 1 });

            if (insertError) throw insertError;
            console.log(`[SERVER] Inserted new search count for '${normalizedSpecies}'`);
        }

    } catch (error) {
        console.error(`[SERVER] Error incrementing bird search for '${normalizedSpecies}':`, error.message);
    }
}


async function updateSupabaseStats(speciesName) {
    console.log("[SERVER] Updating Supabase stats triggered for species:", speciesName || 'N/A');
    await incrementTotalSearches();
    if (speciesName) {
        await incrementBirdSearch(speciesName);
    }
    console.log("[SERVER] Supabase stats update finished.");
}


app.listen(port, () => {
    console.log(`[SERVER] Birdwatching Hub Backend listening on port ${port}`);
    console.log(`[SERVER] Supabase URL configured: ${supabaseUrl ? 'Yes' : 'NO!'}`);
    console.log(`[SERVER] Supabase Key configured: ${supabaseKey ? 'Yes' : 'NO!'}`);
    console.log(`[SERVER] eBird Key configured: ${eBirdAPIKey ? 'Yes' : 'NO!'}`);
});
