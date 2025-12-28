import { ObjectDefinition, InventoryEntry, ItemId } from './types';

/**
 * Calculate the total weight of a container including all nested items.
 * Recursively sums weights of the container itself and all items in contains.
 */
export function calculateContainerWeight(container: ObjectDefinition): number {
    let totalWeight = container.weight * (container.quantity || 1);
    
    if (container.contains && container.contains.length > 0) {
        for (const item of container.contains) {
            totalWeight += calculateContainerWeight(item);
        }
    }
    
    return totalWeight;
}

/**
 * Check if an item can fit in a container based on weight, item count, and dimensional constraints.
 */
export function canFitInContainer(
    item: ObjectDefinition,
    container: ObjectDefinition,
    existingItems: ObjectDefinition[]
): boolean {
    // Check if container has maxItems constraint
    if (container.maxItems !== undefined) {
        if (existingItems.length >= container.maxItems) {
            return false;
        }
    }
    
    // Check if container has maxWeight constraint
    if (container.maxWeight !== undefined) {
        const currentWeight = existingItems.reduce((sum, i) => sum + calculateContainerWeight(i), 0);
        const itemWeight = calculateContainerWeight(item);
        
        if (currentWeight + itemWeight > container.maxWeight) {
            return false;
        }
    }
    
    // Check dimensional constraints if container has dimensions
    if (container.width !== undefined && container.height !== undefined && container.depth !== undefined) {
        const itemWidth = item.width || 0;
        const itemHeight = item.height || 0;
        const itemDepth = item.depth || 0;
        
        // Sum dimensions of existing items
        const existingWidth = existingItems.reduce((sum, i) => sum + (i.width || 0), 0);
        const existingHeight = existingItems.reduce((sum, i) => sum + (i.height || 0), 0);
        const existingDepth = existingItems.reduce((sum, i) => sum + (i.depth || 0), 0);
        
        // Check if adding this item would exceed container dimensions
        if (existingWidth + itemWidth > container.width ||
            existingHeight + itemHeight > container.height ||
            existingDepth + itemDepth > container.depth) {
            return false;
        }
    }
    
    return true;
}

/**
 * Get available space in a container.
 */
export function getAvailableContainerSpace(
    container: ObjectDefinition,
    existingItems: ObjectDefinition[]
): { maxWeight: number; remainingWeight: number; dimensions: { width: number; height: number; depth: number } } {
    const currentWeight = existingItems.reduce((sum, i) => sum + calculateContainerWeight(i), 0);
    const maxWeight = container.maxWeight || Infinity;
    const remainingWeight = Math.max(0, maxWeight - currentWeight);
    
    const existingWidth = existingItems.reduce((sum, i) => sum + (i.width || 0), 0);
    const existingHeight = existingItems.reduce((sum, i) => sum + (i.height || 0), 0);
    const existingDepth = existingItems.reduce((sum, i) => sum + (i.depth || 0), 0);
    
    return {
        maxWeight,
        remainingWeight,
        dimensions: {
            width: (container.width || Infinity) - existingWidth,
            height: (container.height || Infinity) - existingHeight,
            depth: (container.depth || Infinity) - existingDepth
        }
    };
}

/**
 * Find a container in inventory that can hold an item.
 * Returns the first container that has space for the item.
 */
export function findContainerInInventory(
    inventory: InventoryEntry[],
    item: ObjectDefinition,
    objects: Record<ItemId, ObjectDefinition>
): ObjectDefinition | null {
    for (const entry of inventory) {
        // Check if this inventory entry is a container
        const objectData = entry.objectData || objects[entry.id];
        if (!objectData) continue;
        
        // Check if it has the container trait
        if (!objectData.traits.includes('container')) continue;
        
        // Get existing items in container
        const existingItems = objectData.contains || [];
        
        // Check if item can fit
        if (canFitInContainer(item, objectData, existingItems)) {
            return objectData;
        }
    }
    
    return null;
}

/**
 * Get the effective strength of a character including container strength bonuses.
 * Containers with a "strength" trait value add to the character's strength.
 */
export function getEffectiveStrength(
    characterStrength: number,
    inventory: InventoryEntry[],
    objects: Record<ItemId, ObjectDefinition>
): number {
    let effectiveStrength = characterStrength;
    
    for (const entry of inventory) {
        const objectData = entry.objectData || objects[entry.id];
        if (!objectData) continue;
        
        // Check if object has strength trait (format: "strength_5" or similar)
        for (const trait of objectData.traits) {
            if (trait.startsWith('strength_')) {
                const strengthValue = parseInt(trait.split('_')[1]);
                if (!isNaN(strengthValue)) {
                    effectiveStrength += strengthValue;
                }
            }
        }
    }
    
    return effectiveStrength;
}

/**
 * Create hand container objects (left-hand and right-hand).
 * Hands are containers that can hold exactly one item (via maxItems property).
 */
export function createHandContainers(): ObjectDefinition[] {
    return [
        {
            id: 'left-hand',
            weight: 0,
            perception: 0,
            removable: false,
            description: 'Left hand',
            traits: ['container'],
            contains: [],
            maxWeight: Infinity,
            maxItems: 1
        },
        {
            id: 'right-hand',
            weight: 0,
            perception: 0,
            removable: false,
            description: 'Right hand',
            traits: ['container'],
            contains: [],
            maxWeight: Infinity,
            maxItems: 1
        }
    ];
}


/**
 * Get all items from inventory, including items inside containers.
 * Returns items with their container information.
 */
export function getAllItemsWithContainers(
    inventory: InventoryEntry[]
): Array<{ item: ObjectDefinition; container: string | null }> {
    const items: Array<{ item: ObjectDefinition; container: string | null }> = [];
    
    for (const entry of inventory) {
        const containerData = entry.objectData;
        if (!containerData) continue;
        
        // If this entry is a container, get items inside it
        if (containerData.traits.includes('container')) {
            const containedItems = containerData.contains || [];
            for (const containedItem of containedItems) {
                items.push({
                    item: containedItem,
                    container: containerData.id
                });
            }
        } else {
            // This is a regular item (not a container), add it without a container
            items.push({
                item: containerData,
                container: null
            });
        }
    }
    
    return items;
}

/**
 * Find an item in inventory, searching through all containers.
 * Returns the item and its current container ID (null if directly in inventory).
 */
export function findItemInInventory(
    inventory: InventoryEntry[],
    itemId: string
): { item: ObjectDefinition; containerId: string | null } | null {
    // First, check if the item is directly in inventory (not in a container)
    for (const entry of inventory) {
        const objectData = entry.objectData;
        if (!objectData) continue;
        
        // If this entry matches the item ID and is not a container, return it
        if (entry.id === itemId && !objectData.traits.includes('container')) {
            return {
                item: objectData,
                containerId: null
            };
        }
        
        // If this entry is a container, check its contains array
        if (objectData.traits.includes('container')) {
            const containedItems = objectData.contains || [];
            for (const containedItem of containedItems) {
                if (containedItem.id === itemId) {
                    return {
                        item: containedItem,
                        containerId: objectData.id
                    };
                }
            }
        }
    }
    
    return null;
}

/**
 * Normalize a string for fuzzy matching by converting to lowercase and replacing spaces/hyphens.
 */
function normalizeForMatching(str: string): string {
    return str.toLowerCase().replace(/[\s\-_]/g, '');
}

/**
 * Find a container in inventory using fuzzy matching.
 * Tries exact match, case-insensitive match, normalized match, and description match.
 * Returns the inventory entry and container object, or null if not found.
 */
export function findContainerInInventoryFuzzy(
    inventory: InventoryEntry[],
    searchTerm: string
): { entry: InventoryEntry; container: ObjectDefinition } | null {
    const normalizedSearch = normalizeForMatching(searchTerm);
    
    // First pass: exact and case-insensitive ID matches
    for (const entry of inventory) {
        const objectData = entry.objectData;
        if (!objectData) continue;
        
        if (!objectData.traits.includes('container')) continue;
        
        // Exact match
        if (entry.id === searchTerm) {
            return { entry, container: objectData };
        }
        
        // Case-insensitive match
        if (entry.id.toLowerCase() === searchTerm.toLowerCase()) {
            return { entry, container: objectData };
        }
    }
    
    // Second pass: normalized matching (handles "right hand" vs "right-hand")
    for (const entry of inventory) {
        const objectData = entry.objectData;
        if (!objectData) continue;
        
        if (!objectData.traits.includes('container')) continue;
        
        const normalizedId = normalizeForMatching(entry.id);
        if (normalizedId === normalizedSearch) {
            return { entry, container: objectData };
        }
    }
    
    // Third pass: description matching
    for (const entry of inventory) {
        const objectData = entry.objectData;
        if (!objectData) continue;
        
        if (!objectData.traits.includes('container')) continue;
        
        // Check if search term is in description (case-insensitive)
        const description = objectData.description || '';
        if (description.toLowerCase().includes(searchTerm.toLowerCase())) {
            return { entry, container: objectData };
        }
        
        // Also try normalized description matching
        const normalizedDescription = normalizeForMatching(description);
        if (normalizedDescription.includes(normalizedSearch) || normalizedSearch.includes(normalizedDescription)) {
            return { entry, container: objectData };
        }
    }
    
    return null;
}

