import { Composio } from "@composio/core";

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY || "ak_sWY_xO8QxPoVZ1eGqFjm" });

async function main() {
  const session = await composio.create("user_123");
  let allSlugs = [];
  
  for (let page = 1; page <= 5; page++) {
    try {
      const { items } = await session.toolkits({ limit: 50, page });
      if (items.length === 0) break;
      allSlugs.push(...items.map(t => t.slug));
    } catch(e) {
      break;
    }
  }
  
  console.log("ALL AVAILABLE SLUGS:");
  console.log(allSlugs.join(", "));
}

main().catch(console.error);