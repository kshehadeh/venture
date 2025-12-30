import { FlagId, SceneId } from './types';

/**
 * Represents the world state (global flags, visited scenes, turn count).
 */
export class WorldState {
    globalFlags: Set<FlagId>;
    visitedScenes: Set<SceneId>;
    turn: number;

    constructor(data: {
        globalFlags: Set<FlagId>;
        visitedScenes: Set<SceneId>;
        turn: number;
    }) {
        this.globalFlags = new Set(data.globalFlags);
        this.visitedScenes = new Set(data.visitedScenes);
        this.turn = data.turn;
    }

    addFlag(flag: FlagId): WorldState {
        const newFlags = new Set(this.globalFlags);
        newFlags.add(flag);
        return new WorldState({
            globalFlags: newFlags,
            visitedScenes: this.visitedScenes,
            turn: this.turn
        });
    }

    removeFlag(flag: FlagId): WorldState {
        const newFlags = new Set(this.globalFlags);
        newFlags.delete(flag);
        return new WorldState({
            globalFlags: newFlags,
            visitedScenes: this.visitedScenes,
            turn: this.turn
        });
    }

    markSceneVisited(sceneId: SceneId): WorldState {
        const newVisitedScenes = new Set(this.visitedScenes);
        newVisitedScenes.add(sceneId);
        return new WorldState({
            globalFlags: this.globalFlags,
            visitedScenes: newVisitedScenes,
            turn: this.turn
        });
    }

    incrementTurn(): WorldState {
        return new WorldState({
            globalFlags: this.globalFlags,
            visitedScenes: this.visitedScenes,
            turn: this.turn + 1
        });
    }

    clone(): WorldState {
        return new WorldState({
            globalFlags: new Set(this.globalFlags),
            visitedScenes: new Set(this.visitedScenes),
            turn: this.turn
        });
    }

    toJSON(): any {
        return {
            globalFlags: Array.from(this.globalFlags),
            visitedScenes: Array.from(this.visitedScenes),
            turn: this.turn
        };
    }
}

