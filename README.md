# Digest

Social media is riddled with ads and algorithms created specifically to suck us in and take up our time. But leaving social media entirely is hard, especially because many of us rely on it for information and staying connected with friends and family.

That's where Digest comes in. Digest cuts out all of the bloat and distills your feeds into a daily newsletter, containing only what you really want to see.

### [Try it out here!](https://focused-wolf-619.convex.site/)

> **Please note:** Because of lower rate limits on the free Firecrawl plan, some of the features can time out if multiple people are using the site or things are moving too quickly. Sorry in advance!

---

*Made for the Convex All Gas Hackathon*

---

## How it works

```mermaid
flowchart TD
    A["User starts a digest or a scheduled run becomes due"] --> B["Convex creates the digest and starts a durable workflow"]
    B --> C["Firecrawl opens authenticated browser sessions and scrapes connected social feeds"]
    W["Instagram, X, and LinkedIn feeds"] --> C
    C --> D["Convex stores the scraped posts and images"]
    D --> E["OpenAI classifies each post using the user's saved digest preferences"]
    E --> F["Convex drops excluded posts, groups the rest, and finalizes the digest"]
    F --> G["The app reactively renders the saved digest"]
    F --> H["AgentMail emails a compact digest with a link to the full version"]

    H --> I["User replies with updated digest preference instructions"]
    I --> J["AgentMail receives the email and calls the signed Convex webhook"]
    J --> K["Convex verifies and deduplicates the webhook, then starts a reply workflow"]
    K --> L["Convex fetches the reply from AgentMail and validates its sender and thread"]
    L --> M["OpenAI interprets the reply and proposes updated categories and rules"]
    M --> N["Convex checks for concurrent edits and saves the new preferences"]
    N --> O["AgentMail sends a confirmation reply"]
    N --> P["Future digests use the updated preferences"]
    P -. Next run .-> B

    classDef convex fill:#f1e8ff,stroke:#6f3cc3,color:#211238;
    classDef firecrawl fill:#fff0e6,stroke:#e05d22,color:#431a08;
    classDef openai fill:#e7f7f2,stroke:#16856b,color:#083a2f;
    classDef agentmail fill:#eaf2ff,stroke:#3973c6,color:#10294f;
    class B,D,F,K,L,N convex;
    class C firecrawl;
    class E,M openai;
    class H,J,O agentmail;
```
