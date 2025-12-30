import { ObjectDefinition, DetailedDescription, SlotDefinition, ActionEffects, StateDefinition } from './types';

/**
 * Runtime representation of a game object.
 * Encapsulates object behavior and provides methods for querying object state.
 */
export class GameObject {
    private readonly _id: string;
    private readonly _quantity: number;
    private readonly _weight: number;
    private readonly _perception: number;
    private readonly _removable: boolean;
    private readonly _description: string;
    private readonly _traits: string[];
    private readonly _carryEffects?: ActionEffects;
    private readonly _viewEffects?: ActionEffects;
    private readonly _proximityEffect?: ActionEffects;
    private readonly _contains?: GameObject[];
    private readonly _slots?: SlotDefinition[];
    private readonly _maxWeight?: number;
    private readonly _maxItems?: number;
    private readonly _width?: number;
    private readonly _height?: number;
    private readonly _depth?: number;
    private readonly _detailedDescriptions?: DetailedDescription[];
    private readonly _states?: StateDefinition[];
    private readonly _defaultState?: string;

    constructor(data: ObjectDefinition | GameObject) {
        if (data instanceof GameObject) {
            // Clone from another GameObject
            this._id = data._id;
            this._quantity = data._quantity;
            this._weight = data._weight;
            this._perception = data._perception;
            this._removable = data._removable;
            this._description = data._description;
            this._traits = [...data._traits];
            this._carryEffects = data._carryEffects ? { ...data._carryEffects } : undefined;
            this._viewEffects = data._viewEffects ? { ...data._viewEffects } : undefined;
            this._proximityEffect = data._proximityEffect ? { ...data._proximityEffect } : undefined;
            this._contains = data._contains ? data._contains.map(obj => obj.clone()) : undefined;
            this._slots = data._slots ? data._slots.map(slot => ({ ...slot })) : undefined;
            this._maxWeight = data._maxWeight;
            this._maxItems = data._maxItems;
            this._width = data._width;
            this._height = data._height;
            this._depth = data._depth;
            this._detailedDescriptions = data._detailedDescriptions ? data._detailedDescriptions.map(dd => ({ ...dd })) : undefined;
            this._states = data._states ? data._states.map(state => ({ ...state, effects: state.effects ? { ...state.effects } : undefined })) : undefined;
            this._defaultState = data._defaultState;
        } else {
            // Create from ObjectDefinition
            this._id = data.id;
            this._quantity = data.quantity ?? 1;
            this._weight = data.weight;
            this._perception = data.perception;
            this._removable = data.removable;
            this._description = data.description;
            this._traits = data.traits ? [...data.traits] : [];
            this._carryEffects = data.carryEffects ? { ...data.carryEffects } : undefined;
            this._viewEffects = data.viewEffects ? { ...data.viewEffects } : undefined;
            this._proximityEffect = data.proximityEffect ? { ...data.proximityEffect } : undefined;
            this._contains = data.contains ? data.contains.map(obj => new GameObject(obj)) : undefined;
            this._slots = data.slots ? data.slots.map(slot => ({ ...slot })) : undefined;
            this._maxWeight = data.maxWeight;
            this._maxItems = data.maxItems;
            this._width = data.width;
            this._height = data.height;
            this._depth = data.depth;
            this._detailedDescriptions = data.detailedDescriptions ? data.detailedDescriptions.map(dd => ({ ...dd })) : undefined;
            this._states = data.states ? data.states.map(state => ({ ...state, effects: state.effects ? { ...state.effects } : undefined })) : undefined;
            this._defaultState = data.defaultState;
        }
    }

    /**
     * Create a GameObject instance from a validated ObjectDefinition (from JSON).
     */
    static fromJSON(data: ObjectDefinition): GameObject {
        return new GameObject(data);
    }

    // Getters for accessing properties
    get id(): string { return this._id; }
    get quantity(): number { return this._quantity; }
    get weight(): number { return this._weight; }
    get perception(): number { return this._perception; }
    get removable(): boolean { return this._removable; }
    get description(): string { return this._description; }
    get traits(): string[] { return [...this._traits]; }
    get carryEffects(): ActionEffects | undefined { return this._carryEffects ? { ...this._carryEffects } : undefined; }
    get viewEffects(): ActionEffects | undefined { return this._viewEffects ? { ...this._viewEffects } : undefined; }
    get proximityEffect(): ActionEffects | undefined { return this._proximityEffect ? { ...this._proximityEffect } : undefined; }
    get contains(): GameObject[] | undefined { return this._contains ? this._contains.map(obj => obj.clone()) : undefined; }
    get slots(): SlotDefinition[] | undefined { return this._slots ? this._slots.map(slot => ({ ...slot })) : undefined; }
    get maxWeight(): number | undefined { return this._maxWeight; }
    get maxItems(): number | undefined { return this._maxItems; }
    get width(): number | undefined { return this._width; }
    get height(): number | undefined { return this._height; }
    get depth(): number | undefined { return this._depth; }
    get detailedDescriptions(): DetailedDescription[] | undefined { 
        return this._detailedDescriptions ? this._detailedDescriptions.map(dd => ({ ...dd })) : undefined; 
    }
    get states(): StateDefinition[] | undefined {
        return this._states ? this._states.map(state => ({ ...state, effects: state.effects ? { ...state.effects } : undefined })) : undefined;
    }
    get defaultState(): string | undefined {
        return this._defaultState;
    }

    /**
     * Check if object is visible based on character perception.
     */
    isVisible(perception: number): boolean {
        return this._perception <= perception;
    }

    /**
     * Get detailed descriptions visible at the given perception level.
     */
    getVisibleDetailedDescriptions(perception: number): DetailedDescription[] {
        if (!this._detailedDescriptions) {
            return [];
        }
        return this._detailedDescriptions.filter(dd => dd.perception <= perception);
    }

    /**
     * Check if this object is a container (has container trait).
     */
    isContainer(): boolean {
        return this._traits.includes('container');
    }

    /**
     * Get effects for a specific state.
     * Returns undefined if the state doesn't exist or has no effects.
     */
    getStateEffects(stateId: string): ActionEffects | undefined {
        if (!this._states) {
            return undefined;
        }
        const state = this._states.find(s => s.id === stateId);
        return state?.effects ? { ...state.effects } : undefined;
    }

    /**
     * Get description for a specific state.
     * Returns undefined if the state doesn't exist or has no description.
     */
    getStateDescription(stateId: string): string | undefined {
        if (!this._states) {
            return undefined;
        }
        const state = this._states.find(s => s.id === stateId);
        return state?.description;
    }

    /**
     * Calculate total weight including nested items.
     */
    getTotalWeight(objectsMap?: Record<string, GameObject>): number {
        let totalWeight = this._weight * this._quantity;
        
        // Add weight from general storage (contains array)
        if (this._contains && this._contains.length > 0) {
            for (const item of this._contains) {
                totalWeight += item.getTotalWeight(objectsMap);
            }
        }
        
        // Add weight from slot contents
        if (this._slots && this._slots.length > 0 && objectsMap) {
            for (const slot of this._slots) {
                if (slot.itemId) {
                    const slotItem = objectsMap[slot.itemId];
                    if (slotItem) {
                        totalWeight += slotItem.getTotalWeight(objectsMap);
                    }
                }
            }
        }
        
        return totalWeight;
    }

    /**
     * Check if an item can fit in this container.
     */
    canFit(item: GameObject, existingItems: GameObject[], objectsMap?: Record<string, GameObject>): boolean {
        // Check if container has maxItems constraint (for general storage only)
        if (this._maxItems !== undefined) {
            if (existingItems.length >= this._maxItems) {
                return false;
            }
        }
        
        // Check if container has maxWeight constraint
        // Note: This checks general storage weight, but slot contents also contribute to total weight
        if (this._maxWeight !== undefined) {
            const currentWeight = existingItems.reduce((sum, i) => sum + i.getTotalWeight(objectsMap), 0);
            const itemWeight = item.getTotalWeight(objectsMap);
            
            // Also account for slot contents weight
            let slotWeight = 0;
            if (this._slots && objectsMap) {
                for (const slot of this._slots) {
                    if (slot.itemId) {
                        const slotItem = objectsMap[slot.itemId];
                        if (slotItem) {
                            slotWeight += slotItem.getTotalWeight(objectsMap);
                        }
                    }
                }
            }
            
            if (currentWeight + itemWeight + slotWeight > this._maxWeight) {
                return false;
            }
        }
        
        // Check dimensional constraints if container has dimensions
        if (this._width !== undefined && this._height !== undefined && this._depth !== undefined) {
            const itemWidth = item.width || 0;
            const itemHeight = item.height || 0;
            const itemDepth = item.depth || 0;
            
            // Sum dimensions of existing items in general storage
            const existingWidth = existingItems.reduce((sum, i) => sum + (i.width || 0), 0);
            const existingHeight = existingItems.reduce((sum, i) => sum + (i.height || 0), 0);
            const existingDepth = existingItems.reduce((sum, i) => sum + (i.depth || 0), 0);
            
            // Check if adding this item would exceed container dimensions
            if (existingWidth + itemWidth > this._width ||
                existingHeight + itemHeight > this._height ||
                existingDepth + itemDepth > this._depth) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Create a deep copy of this GameObject.
     */
    clone(): GameObject {
        return new GameObject(this);
    }

    /**
     * Serialize to plain ObjectDefinition for JSON.
     */
    toJSON(): ObjectDefinition {
        return {
            id: this._id,
            quantity: this._quantity,
            weight: this._weight,
            perception: this._perception,
            removable: this._removable,
            description: this._description,
            traits: [...this._traits],
            carryEffects: this._carryEffects ? { ...this._carryEffects } : undefined,
            viewEffects: this._viewEffects ? { ...this._viewEffects } : undefined,
            proximityEffect: this._proximityEffect ? { ...this._proximityEffect } : undefined,
            contains: this._contains ? this._contains.map(obj => obj.toJSON()) : undefined,
            slots: this._slots ? this._slots.map(slot => ({ ...slot })) : undefined,
            maxWeight: this._maxWeight,
            maxItems: this._maxItems,
            width: this._width,
            height: this._height,
            depth: this._depth,
            detailedDescriptions: this._detailedDescriptions ? this._detailedDescriptions.map(dd => ({ ...dd })) : undefined,
            states: this._states ? this._states.map(state => ({ ...state, effects: state.effects ? { ...state.effects } : undefined })) : undefined,
            defaultState: this._defaultState
        };
    }
}

