import { type, Schema, MapSchema } from '@colyseus/schema';
import { CPlayer } from './CPlayer';

export class Team extends Schema {
    @type(`int16`)
    totalMindis: number = 0;

    @type(`int16`)
    totalHands: number = 0;

    @type({ map: CPlayer })
    players: MapSchema<CPlayer> = new MapSchema<CPlayer>();
}
