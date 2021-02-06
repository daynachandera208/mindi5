import { type, Schema, MapSchema } from '@colyseus/schema';
import { CCard } from './CCard';

export class CPlayer extends Schema {
    @type(`int16`)
    seat: number;

    @type(`string`)
    sessionId: string;

    @type(`string`)
    name: string;

    connected: boolean = true;

    cards: MapSchema<CCard> = new MapSchema<CCard>();
}
