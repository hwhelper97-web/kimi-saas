const prisma = require("../config/prisma");

/**
 * 🛠️ Menu Alias Service
 * Handles generation and matching of AI voice aliases for menu items.
 */
class MenuAliasService {
  
  /**
   * Automatically generates a set of spoken-friendly aliases for a menu item name.
   * Example: "Chicken Zinger Burger" -> ["zinger burger", "chicken burger", "zinger", "crispy burger"]
   */
  generateAutoAliases(name) {
    if (!name) return [];
    
    const normalized = name.toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .trim();
    
    const words = normalized.split(' ');
    const aliases = new Set();
    
    // 1. Original normalized name
    aliases.add(normalized);
    
    // 2. Individual words (if they are significant)
    words.forEach(word => {
      if (word.length > 3 && !['with', 'extra', 'side'].includes(word)) {
        aliases.add(word);
      }
    });

    // 3. Common combinations
    if (words.length >= 2) {
      // First and last words (often the main descriptor)
      aliases.add(`${words[0]} ${words[words.length - 1]}`);
      
      // Last two words
      aliases.add(words.slice(-2).join(' '));
    }

    // 4. Handle "Chicken" specific variations (if applicable)
    if (normalized.includes('chicken')) {
      aliases.add(normalized.replace('chicken', '').trim());
    }

    // 5. Handle "Burger" specific variations
    if (normalized.includes('burger')) {
      aliases.add(normalized.replace('burger', '').trim());
    }

    // Remove duplicates and empty strings
    return Array.from(aliases).filter(a => a && a.length > 2);
  }

  /**
   * Saves a set of aliases for a menu item.
   */
  async saveAliases(menuItemId, tenantId, aliases) {
    // Delete existing aliases first (simplest update strategy)
    await prisma.menuItemAlias.deleteMany({
      where: { menuItemId }
    });

    if (!aliases || !aliases.length) return [];

    // Create new aliases
    const data = aliases.map(a => ({
      alias: a.toLowerCase().trim(),
      menuItemId,
      tenantId
    }));

    await prisma.menuItemAlias.createMany({
      data
    });

    return data;
  }

  /**
   * Matches a piece of spoken text against the aliases of a business's menu.
   * Uses exact matching, partial matching, and basic fuzzy logic.
   */
  async matchItem(businessId, spokenText) {
    if (!spokenText) return null;
    
    const input = spokenText.toLowerCase().trim();
    
    // 1. Fetch all aliases for this business
    const items = await prisma.menuItem.findMany({
      where: { businessId },
      include: { aliases: true }
    });

    let bestMatch = null;
    let highestConfidence = 0;

    for (const item of items) {
      // Check canonical name first
      if (item.name.toLowerCase() === input) return { item, confidence: 1.0 };

      for (const aliasObj of item.aliases) {
        const alias = aliasObj.alias.toLowerCase();
        
        // Exact Match
        if (alias === input) return { item, confidence: 1.0, matchedAlias: alias };

        // Partial Match (Alias within input)
        if (input.includes(alias)) {
          const confidence = alias.length / input.length;
          if (confidence > highestConfidence) {
            highestConfidence = confidence;
            bestMatch = { item, confidence, matchedAlias: alias };
          }
        }

        // Fuzzy Match (Simple Word Overlap)
        const inputWords = input.split(' ');
        const aliasWords = alias.split(' ');
        const overlap = aliasWords.filter(w => inputWords.includes(w));
        
        if (overlap.length > 0) {
          const confidence = (overlap.length / aliasWords.length) * 0.8; // Penalty for fuzzy
          if (confidence > highestConfidence) {
            highestConfidence = confidence;
            bestMatch = { item, confidence, matchedAlias: alias };
          }
        }
      }
    }

    return highestConfidence > 0.6 ? bestMatch : null;
  }
}

module.exports = new MenuAliasService();
