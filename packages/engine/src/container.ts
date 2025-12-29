import { ObjectDefinition, InventoryEntry, ItemId, SlotDefinition } from './types';

/**
 * Calculate the total weight of a container including all nested items.
 * Recursively sums weights of the container itself, all items in contains, and all items in slots.
 */
export function calculateContainerWeight(container: ObjectDefinition, objectsMap?: Record<ItemId, ObjectDefinition>): number {
    let totalWeight = container.weight * (container.quantity || 1);
    
    // Add weight from general storage (contains array)
    if (container.contains && container.contains.length > 0) {
        for (const item of container.contains) {
            totalWeight += calculateContainerWeight(item, objectsMap);
        }
    }
    
    // Add weight from slot contents
    if (container.slots && container.slots.length > 0 && objectsMap) {
        for (const slot of container.slots) {
            if (slot.itemId) {
                const slotItem = objectsMap[slot.itemId];
                if (slotItem) {
                    totalWeight += calculateContainerWeight(slotItem, objectsMap);
                }
            }
        }
    }
    
    return totalWeight;
}

/**
 * Check if an item can fit in a specific slot based on weight and dimensional constraints.
 */
export function canFitInSlot(
    item: ObjectDefinition,
    slot: SlotDefinition,
    objectsMap?: Record<ItemId, ObjectDefinition>
): boolean {
    // Check if slot is already occupied
    if (slot.itemId) {
        return false;
    }
    
    // Check weight constraint
    if (slot.maxWeight !== undefined) {
        const itemWeight = calculateContainerWeight(item, objectsMap);
        if (itemWeight > slot.maxWeight) {
            return false;
        }
    }
    
    // Check dimensional constraints if slot has dimensions
    if (slot.width !== undefined && slot.height !== undefined && slot.depth !== undefined) {
        const itemWidth = item.width || 0;
        const itemHeight = item.height || 0;
        const itemDepth = item.depth || 0;
        
        if (itemWidth > slot.width || itemHeight > slot.height || itemDepth > slot.depth) {
            return false;
        }
    }
    
    return true;
}

/**
 * Find a slot in a container by ID.
 */
export function findSlotInContainer(
    container: ObjectDefinition,
    slotId: string
): SlotDefinition | null {
    if (!container.slots) {
        return null;
    }
    
    return container.slots.find(slot => slot.id === slotId) || null;
}

/**
 * Get all available (empty) slots in a container.
 */
export function getAvailableSlots(container: ObjectDefinition): SlotDefinition[] {
    if (!container.slots) {
        return [];
    }
    
    return container.slots.filter(slot => !slot.itemId);
}

/**
 * Get all items currently in slots (returns slot info with item IDs).
 */
export function getSlotContents(container: ObjectDefinition): Array<{ slot: SlotDefinition; itemId: string }> {
    if (!container.slots) {
        return [];
    }
    
    return container.slots
        .filter(slot => slot.itemId)
        .map(slot => ({ slot, itemId: slot.itemId! }));
}

/**
 * Check if an item can fit in a container based on weight, item count, and dimensional constraints.
 * This checks general storage (contains array), not slots.
 */
export function canFitInContainer(
    item: ObjectDefinition,
    container: ObjectDefinition,
    existingItems: ObjectDefinition[],
    objectsMap?: Record<ItemId, ObjectDefinition>
): boolean {
    // Check if container has maxItems constraint (for general storage only)
    if (container.maxItems !== undefined) {
        if (existingItems.length >= container.maxItems) {
            return false;
        }
    }
    
    // Check if container has maxWeight constraint
    // Note: This checks general storage weight, but slot contents also contribute to total weight
    if (container.maxWeight !== undefined) {
        const currentWeight = existingItems.reduce((sum, i) => sum + calculateContainerWeight(i, objectsMap), 0);
        const itemWeight = calculateContainerWeight(item, objectsMap);
        
        // Also account for slot contents weight
        let slotWeight = 0;
        if (container.slots && objectsMap) {
            for (const slot of container.slots) {
                if (slot.itemId) {
                    const slotItem = objectsMap[slot.itemId];
                    if (slotItem) {
                        slotWeight += calculateContainerWeight(slotItem, objectsMap);
                    }
                }
            }
        }
        
        if (currentWeight + itemWeight + slotWeight > container.maxWeight) {
            return false;
        }
    }
    
    // Check dimensional constraints if container has dimensions
    if (container.width !== undefined && container.height !== undefined && container.depth !== undefined) {
        const itemWidth = item.width || 0;
        const itemHeight = item.height || 0;
        const itemDepth = item.depth || 0;
        
        // Sum dimensions of existing items in general storage
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
 * Accounts for both general storage and slot contents.
 */
export function getAvailableContainerSpace(
    container: ObjectDefinition,
    existingItems: ObjectDefinition[],
    objectsMap?: Record<ItemId, ObjectDefinition>
): { maxWeight: number; remainingWeight: number; dimensions: { width: number; height: number; depth: number } } {
    const currentWeight = existingItems.reduce((sum, i) => sum + calculateContainerWeight(i, objectsMap), 0);
    
    // Add weight from slot contents
    let slotWeight = 0;
    if (container.slots && objectsMap) {
        for (const slot of container.slots) {
            if (slot.itemId) {
                const slotItem = objectsMap[slot.itemId];
                if (slotItem) {
                    slotWeight += calculateContainerWeight(slotItem, objectsMap);
                }
            }
        }
    }
    
    const maxWeight = container.maxWeight || Infinity;
    const remainingWeight = Math.max(0, maxWeight - currentWeight - slotWeight);
    
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
 * Hands are containers with 5 ring slots each plus general storage for held items.
 */
export function createHandContainers(): ObjectDefinition[] {
    const createRingSlots = (): SlotDefinition[] => {
        return [
            { id: 'ring-1', name: 'Thumb', maxWeight: 0.1, width: 1, height: 1, depth: 1, itemId: null },
            { id: 'ring-2', name: 'Index finger', maxWeight: 0.1, width: 1, height: 1, depth: 1, itemId: null },
            { id: 'ring-3', name: 'Middle finger', maxWeight: 0.1, width: 1, height: 1, depth: 1, itemId: null },
            { id: 'ring-4', name: 'Ring finger', maxWeight: 0.1, width: 1, height: 1, depth: 1, itemId: null },
            { id: 'ring-5', name: 'Pinky', maxWeight: 0.1, width: 1, height: 1, depth: 1, itemId: null }
        ];
    };
    
    return [
        {
            id: 'left-hand',
            weight: 0,
            perception: 0,
            removable: false,
            description: 'Left hand',
            traits: ['container'],
            contains: [], // General storage for held items (sword, torch, etc.)
            slots: createRingSlots(), // 5 ring slots
            maxWeight: Infinity,
            maxItems: 1 // For general storage (one held item)
        },
        {
            id: 'right-hand',
            weight: 0,
            perception: 0,
            removable: false,
            description: 'Right hand',
            traits: ['container'],
            contains: [], // General storage for held items (sword, torch, etc.)
            slots: createRingSlots(), // 5 ring slots
            maxWeight: Infinity,
            maxItems: 1 // For general storage (one held item)
        }
    ];
}


/**
 * Get all items from inventory, including items inside containers and slots.
 * Returns items with their container information and slot information.
 */
export function getAllItemsWithContainers(
    inventory: InventoryEntry[],
    objectsMap?: Record<ItemId, ObjectDefinition>
): Array<{ item: ObjectDefinition; container: string | null; slot?: string | null }> {
    const items: Array<{ item: ObjectDefinition; container: string | null; slot?: string | null }> = [];
    
    // Build objects map if not provided
    if (!objectsMap) {
        objectsMap = {};
        for (const entry of inventory) {
            if (entry.objectData) {
                objectsMap[entry.id] = entry.objectData;
            }
        }
    }
    
    for (const entry of inventory) {
        const containerData = entry.objectData;
        if (!containerData) continue;
        
        // If this entry is a container, get items inside it (both general storage and slots)
        if (containerData.traits.includes('container')) {
            // Get items from general storage (contains array)
            const containedItems = containerData.contains || [];
            for (const containedItem of containedItems) {
                items.push({
                    item: containedItem,
                    container: containerData.id,
                    slot: null
                });
            }
            
            // Get items from slots
            if (containerData.slots) {
                for (const slot of containerData.slots) {
                    if (slot.itemId) {
                        const slotItem = objectsMap?.[slot.itemId];
                        if (slotItem) {
                            items.push({
                                item: slotItem,
                                container: containerData.id,
                                slot: slot.id
                            });
                        } else {
                            // If item not found in objectsMap, create a minimal item from the slot itemId
                            // This ensures items in slots always show up in inventory, even if we can't find their full definition
                            // This can happen if an item was transferred to a slot and removed from scene objects
                            items.push({
                                item: { 
                                    id: slot.itemId, 
                                    weight: 0, 
                                    perception: 0, 
                                    removable: true, 
                                    description: slot.itemId, 
                                    traits: [] 
                                },
                                container: containerData.id,
                                slot: slot.id
                            });
                        }
                    }
                }
            }
        } else {
            // This is a regular item (not a container), add it without a container
            items.push({
                item: containerData,
                container: null,
                slot: null
            });
        }
    }
    
    return items;
}

/**
 * Find an item in inventory, searching through all containers and slots.
 * Returns the item, its current container ID (null if directly in inventory), and slot ID if in a slot.
 */
export function findItemInInventory(
    inventory: InventoryEntry[],
    itemId: string
): { item: ObjectDefinition; containerId: string | null; slotId?: string | null } | null {
    // First, check if the item is directly in inventory (not in a container)
    for (const entry of inventory) {
        const objectData = entry.objectData;
        if (!objectData) continue;
        
        // If this entry matches the item ID and is not a container, return it
        if (entry.id === itemId && !objectData.traits.includes('container')) {
            return {
                item: objectData,
                containerId: null,
                slotId: null
            };
        }
        
        // If this entry is a container, check its contains array
        if (objectData.traits.includes('container')) {
            const containedItems = objectData.contains || [];
            for (const containedItem of containedItems) {
                if (containedItem.id === itemId) {
                    return {
                        item: containedItem,
                        containerId: objectData.id,
                        slotId: null
                    };
                }
            }
            
            // Also check slots
            if (objectData.slots) {
                for (const slot of objectData.slots) {
                    if (slot.itemId === itemId) {
                        return {
                            item: { id: itemId } as ObjectDefinition, // We'll need to look up the full item
                            containerId: objectData.id,
                            slotId: slot.id
                        };
                    }
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

