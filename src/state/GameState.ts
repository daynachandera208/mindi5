import { type, Schema, ArraySchema } from '@colyseus/schema';
import { Team } from './Team';
import { CCard } from './CCard';

export class GameState extends Schema {
    @type(Team)
    teamA: Team = new Team();

    @type(Team)
    teamB: Team = new Team();

    @type(`int16`)
    turnsCompleted: number = 0; // turns completed in a round

    @type(`int16`)
    roundsCompleted: number = 0;    // rounds completed in a game

    @type(`int16`)
    roundMindis: number = 0;

    @type(`int16`)
    totalDecks: number;

    @type([ CCard ])
    deck: ArraySchema<CCard> = new ArraySchema<CCard>();

    @type(`string`)
    mode: string;

    @type(`boolean`)
    jokerActive: boolean = false;

    @type([ CCard ])
    roundCards: ArraySchema<CCard> = new ArraySchema<CCard>();

    @type(`string`)
    trump: string;

    @type(`boolean`)
    trumpActive: boolean = false;
}
