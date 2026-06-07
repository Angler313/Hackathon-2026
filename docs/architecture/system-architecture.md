# Coastal Angler Guide — System Architecture

```mermaid
graph TB
    subgraph "Frontend (Vercel)"
        SPA["Vite + React SPA<br/>wouter Router"]
        UI["shadcn/ui Components<br/>Tailwind CSS v4"]
        RQ["TanStack React Query<br/>API Client Hooks"]
    end

    subgraph "Backend (Codespace)"
        API["Express 5 API Server<br/>Port 3001"]
        FISH["Fishing Intelligence Engine<br/>2181 lines"]
        DB["PostgreSQL via Drizzle ORM<br/>Spots · Catches · Observations"]
    end

    subgraph "Shared Libraries"
        ZOD["@workspace/api-zod<br/>Zod Validation Schemas"]
        CLIENT["@workspace/api-client-react<br/>Generated API Hooks"]
        AI["@workspace/integrations-openrouter-ai<br/>OpenRouter Batch Processor"]
    end

    subgraph "External Services"
        NOAA["NOAA Tides & Currents<br/>Tide Predictions"]
        WEATHER["Open-Meteo<br/>Weather + Marine Data"]
        OSM["Nominatim / OpenStreetMap<br/>Geocoding"]
        WIKI["Wikipedia API<br/>Species Lookup"]
        INAT["iNaturalist API<br/>Community Observations"]
        GROQ["Groq AI<br/>LLaMA Vision (Fish ID)"]
    end

    USR["👤 Angler User"] --> SPA
    SPA --> UI
    SPA --> RQ
    RQ --> API
    
    API --> FISH
    API --> DB
    
    FISH --> ZOD
    FISH --> NOAA
    FISH --> WEATHER
    FISH --> OSM
    FISH --> WIKI
    FISH --> INAT
    FISH --> GROQ
    
    CLIENT --> RQ
    ZOD --> CLIENT
    AI --> FISH
    
    style USR fill:#f9f,stroke:#333,stroke-width:2px
    style SPA fill:#e1f5fe,stroke:#0288d1
    style API fill:#e8f5e9,stroke:#388e3c
    style FISH fill:#c8e6c9,stroke:#2e7d32
    style DB fill:#fff3e0,stroke:#f57c00
```

## Search-Location Request Flow

```mermaid
sequenceDiagram
    participant U as 👤 User
    participant D as Dashboard
    component LS as LocationSearch
    participant API as Express API
    participant CL as classifyLocation()
    participant EXT as External APIs
    participant RESP as Response

    U->>D: Types location name
    D->>LS: handleSearch("Lake Conroe")
    LS->>API: POST /api/fishing/search-location
    Note over API: Zod validation
    
    API->>CL: classifyLocation("lake conroe")
    CL-->>API: regionKey: "lake-conroe"<br/>matchType: "exact"
    
    par Species + Bait
        API->>API: Lookup REGION_PROFILES
        API->>API: fillBaitMap() ← SPECIES_BAIT
    and Tide Data
        API->>EXT: getTideData() → NOAA / Lunar sim
    and Weather
        API->>EXT: fetchWeather() → Open-Meteo
    end
    
    alt Unknown Location (estimated)
        API->>EXT: geocodeLocation() → Nominatim
        API->>EXT: lookupFishOnWikipedia()
        API->>EXT: lookupFishOnINaturalist()
    end
    
    API->>RESP: Assemble response
    RESP-->>LS: JSON result
    LS-->>D: Update dashboard cards
    D-->>U: Show conditions, species, bait
```

## Accessible at:
- **Live site**: https://hackathon-2026-alpha.vercel.app
- **API base**: https://fantastic-broccoli-wvr56w66qxq5cg764-3001.app.github.dev
