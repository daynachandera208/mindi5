import { type, Schema } from '@colyseus/schema';

export class CCard extends Schema {
    @type(`int16`)
    number: number;

    @type(`string`)
    face: string;

    @type(`string`)
    suit: string;

    @type(`string`)
    playerSessionId: string;

    @type(`boolean`)
    isTrump: boolean = false;
}
