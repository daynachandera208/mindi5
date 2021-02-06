import { MapSchema, ArraySchema } from '@colyseus/schema';
import { CPlayer } from '../state/CPlayer';
import { CCard } from '../state/CCard';
import { Team } from '../state/Team';

export class BotUtils {

    suits = [
		'Heart',
		'Spade',
		'Club',
		'Diamond'
    ];
    
    noSuitCards: MapSchema<string> = new MapSchema<string>();

    lowSuitCards: MapSchema<string> = new MapSchema<string>();

    teamA: Team;

    teamB: Team;

    bots: MapSchema<CPlayer> = new MapSchema<CPlayer>();

    jokerActive: boolean = false;

    trumpActive: boolean = false;

    trump: string = '';

    playerCount: number = 0;

    curRoundPlayedPlayers: string[] = [];

    roundsCompleted: number = 0;

    jokerSuit: string = 'Joker';

    mode: string;

    remainingCards: MapSchema<CCard> = new MapSchema<CCard>();

    resetBotData() {
        this.noSuitCards = new MapSchema<string>();
        this.lowSuitCards = new MapSchema<string>();
        this.teamA = null;
        this.teamB = null;
        this.jokerActive = false;
        this.trumpActive = false;
        this.trump = '';
        this.playerCount = 0;
        this.curRoundPlayedPlayers = [];
        this.roundsCompleted = 0;
        this.remainingCards  = new MapSchema<CCard>();
    }

    makeId(length) {
        var result           = '';
        var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var charactersLength = characters.length;
        for ( var i = 0; i < length; i++ ) {
           result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }
        return result;
     }

    addBot = (sessionId: string, player: CPlayer) => {
        this.bots[sessionId] = player;
    }

    isBotTurn = (curPlayerSeat: number) : boolean => {
        for(let id in this.bots) {
            if(this.bots[id].seat === curPlayerSeat)
                return true;
        }
        return false;
    }

    removeFromRemainingCards(card: CCard) {
        let cards: ArraySchema<CCard> = new ArraySchema<CCard>();
        let botCs: ArraySchema<CCard> = this.remainingCards[card.suit];
        for(let i = 0; i < botCs.length; i++) {
            if(botCs[i].number !== card.number || botCs[i].suit !== card.suit) {
                cards.push(botCs[i]);
            }
        }
        this.remainingCards[card.suit] = cards;
    }

    chooseHideCard = (player: CPlayer) : CCard => {
        return this.getRandomCard(player);
    }

    getRandomCard(player: CPlayer) : CCard {
        let ids: string[] = Object.keys(player.cards);
        let randomeSuit: number = -1;
        let cards : ArraySchema<CCard>;
        do {
            randomeSuit = Math.floor(Math.random() * ids.length);
            cards = player.cards[ids[randomeSuit]];
        }
        while(!cards || cards.length == 0);

        let randomCard = Math.floor( Math.random() * cards.length);
        console.log(`Returning RandomCard = ${cards[randomCard]}`);
        return cards[randomCard];
    }

    getRandomSuitCard(player: CPlayer, suit: string) : CCard {
        let cards : ArraySchema<CCard> = player.cards[suit];
        let randomCard = Math.floor( Math.random() * cards.length);
        return cards[randomCard];
    }

    removeBotCard(sessionId: string, card: CCard) {
        let player = this.bots[sessionId];

        let cs: ArraySchema<CCard> = player.cards[card.suit];
        for(let i = 0; i < cs.length; i++) {
            if(cs[i].number === card.number && cs[i].suit === card.suit) {
                player.cards[card.suit].splice(i, 1);
                break;
            }
        }
    }

    determinHighCard = (roundCards: ArraySchema<CCard>) : CCard => {		
		let highCard: CCard = null;

		// If joker included, check for joker
		if(this.jokerActive) {
			roundCards.forEach(card => {
				if(card.number == 0) {
					highCard = card;
				}
			});

			if(highCard != null) {
				return highCard;
			}
		}

		let highNum: number = 0;
		// If trump is active, find highest trump
		if(this.trumpActive) {
			roundCards.forEach(card => {
				if(card.suit == this.trump && card.number >= highNum) {
					highNum = card.number;
					highCard = card;
				}
			});

			if(highCard != null) {
				return highCard;
			}
		}

		// check high card in all played cards
		highCard = roundCards[0];
		for(let i = 1; i < roundCards.length; i++) {
			if(highCard.suit == roundCards[i].suit && roundCards[i].number >= highCard.number) {
				highCard = roundCards[i];
			}
		}

		return highCard;
    }

    // Logic is pulled from client side Bot.cs file
    getBotTurnCard = (player: CPlayer, roundCards: ArraySchema<CCard>) : CCard => {
        
        if(roundCards) {
            roundCards.forEach(card => {
                this.curRoundPlayedPlayers.push(card.playerSessionId);
            });
        }

        let playedCard: CCard = null;

        if (roundCards.length == 0) {

            playedCard = this.trumpActive ? this.firstTurnAfterTrump(player) : this.firstTurnBeforeTrump(player);
        }
        else {
            if (roundCards.length < this.playerCount - 1) {
                playedCard = this.trumpActive ? this.middleTurnAfterTrump(player, roundCards) : this.middleTurnBeforeTrump(player, roundCards);
            }
            else {
                playedCard = this.trumpActive ? this.lastTurnAfterHakam(player, roundCards) : this.lastTurnBeforeHakam(player, roundCards);
            }
        }

        if(!playedCard)
            playedCard = this.getRandomCard(player);
        return playedCard;
    }

    middleTurnAfterTrump(player: CPlayer, roundCards: ArraySchema<CCard>) : CCard {
        let followSuit: string = roundCards[0].suit;
        let maxCard: CCard = this.determinHighCard(roundCards);
        let mustFollowSuit: boolean = this.hasThisSuitCard(player, followSuit);

        let myMaxCard: CCard = null;
        if (mustFollowSuit) {
            myMaxCard = this.getMaxCardOf(player, followSuit);
        }
        else {
            if(!this.noSuitCards[player.sessionId]) {
                this.noSuitCards[player.sessionId] = followSuit;
            }
        }

        if (maxCard.suit === this.trump) {
            if (maxCard.number > this.getMaxCardFromRemainingCards(this.trump)) {
                if (this.isMyPartner(player.sessionId, maxCard.playerSessionId))
                {
                    let mindi: CCard = this.getMindi(player, followSuit, mustFollowSuit);
                    if (mindi)
                        return mindi;
                }

                if (mustFollowSuit) {
                    return this.getMinCardNotMindiOf(player, followSuit);
                }
                else if (this.hasThisSuitCard(player, this.trump)) {
                    let maxThanCard: CCard = this.getMaxCardThan(player, maxCard);
                    if (maxThanCard)
                        return maxThanCard;
                }

                return this.getLowestCardNotMindi(player);
            }

            let enemyCutId: string = this.enemyCut(followSuit, player.sessionId, player.sessionId);
            if (enemyCutId == null) {
                if (this.isMyPartner(player.sessionId, maxCard.playerSessionId)) {
                    let mindi: CCard = this.getMindi(player, followSuit, mustFollowSuit);
                    if (mindi)
                        return mindi;
                    else if (mustFollowSuit)
                        return this.getMinCardNotMindiOf(player, followSuit);
                    else
                        return this.getLowestCardNotMindi(player);

                }

                let partnerCutId: string = this.partnerCut(followSuit, player.sessionId, player.sessionId);
                if (partnerCutId != null) {
                    let mindi: CCard = this.getMindi(player, followSuit, mustFollowSuit);
                    if (mindi)
                        return mindi;
                    else if (mustFollowSuit)
                        return this.getMinCardNotMindiOf(player, followSuit);
                    else
                        return this.getLowestCardNotMindi(player);
                }

                if (mustFollowSuit) {
                    return this.getMinCardNotMindiOf(player, followSuit);
                }
                else if (this.hasThisSuitCard(player, this.trump)) {
                    let trumpCard: CCard = this.getMaxCardOf(player, this.trump);
                    if (trumpCard && trumpCard.number >= maxCard.number)
                    {
                        let maxThanCard: CCard = this.getMaxCardThan(player, maxCard);
                        if (maxThanCard)
                            return maxThanCard;
                    }
                }

                if (mustFollowSuit)
                    return this.getMinCardNotMindiOf(player, followSuit);
                else
                    return this.getLowestCardNotMindi(player);
            }
         
            if (this.partnerCut(followSuit, enemyCutId, player.sessionId) != null) {        
                let mindi: CCard = this.getMindi(player, followSuit, mustFollowSuit);
                if (mindi)
                    return mindi;
                else if (mustFollowSuit)
                    return this.getMinCardNotMindiOf(player, followSuit);
                else
                    return this.getLowestCardNotMindi(player);
            }
        
            if (this.roundCardsContainMindi(roundCards)) {
                if (mustFollowSuit) {
                    if (this.hasJoker(player))
                        return this.getRandomSuitCard(player, this.jokerSuit);

                    return this.getMinCardNotMindiOf(player, followSuit);
                }
                else if(this.hasThisSuitCard(player, this.trump)) {
                    let maxThanCard: CCard = this.getMaxCardThan(player, maxCard);
                    if (maxThanCard)
                        return maxThanCard;

                    if (this.hasJoker(player))
                        return this.getRandomSuitCard(player, this.jokerSuit);
                }
            }

            if (mustFollowSuit) {
                return this.getMinCardNotMindiOf(player, followSuit);
            }
            else if (this.hasThisSuitCard(player, this.trump)) {
                let trumpCard: CCard = this.getMaxCardOf(player, this.trump);
                if (trumpCard)                
                    return trumpCard;                
            }
       
            if (mustFollowSuit)
                return this.getMinCardNotMindiOf(player, followSuit);
            else
                return this.getLowestCardNotMindi(player);
        }
        else if (maxCard.number !== 0) {
            if (maxCard.number > this.getMaxCardFromRemainingCards(followSuit)) {
                if (this.enemyCut(followSuit, player.sessionId, player.sessionId) == null) {
                    if (this.isMyPartner(player.sessionId, maxCard.playerSessionId)) {
                        let mindi: CCard = this.getMindi(player, followSuit, mustFollowSuit);
                        if (mindi && maxCard.number > this.getMaxCardFromRemainingCards(followSuit))
                            return mindi;
                        else if (mustFollowSuit)
                            return this.getMinCardNotMindiOf(player, followSuit);
                        else
                            return this.getLowestCardNotMindi(player);
                    }

                    if (this.roundCardsContainMindi(roundCards)) {
                        if (mustFollowSuit) {
                            if (myMaxCard.number >= maxCard.number)
                                return myMaxCard;
                        }
                        else if (this.hasThisSuitCard(player, this.trump)) {
                            let trumpCard: CCard = this.getMinCardOf(player, this.trump);
                            if (trumpCard)
                                return trumpCard;
                        }

                        if (this.hasJoker(player))
                            return this.getRandomSuitCard(player, this.jokerSuit);
                    }

                    if (mustFollowSuit) {
                        if (myMaxCard.number >= maxCard.number)
                            return myMaxCard;
                    }
                    else if (this.hasThisSuitCard(player, this.trump)) {
                        let trumpCard: CCard = this.getMinCardOf(player, this.trump);
                        if (trumpCard)
                            return trumpCard;
                    }
                }

                if (this.roundCardsContainMindi(roundCards)) {
                    if (mustFollowSuit) {
                        if (this.hasJoker(player))
                            return this.getRandomSuitCard(player, this.jokerSuit);

                        return this.getMinCardOf(player, followSuit);
                    }
                    else if (this.hasThisSuitCard(player, this.trump)) {
                        let trumpCard: CCard = this.getMaxCardOf(player, this.trump);
                        if (trumpCard)
                            return trumpCard;
                    }
                }

                if (mustFollowSuit) {
                    if (myMaxCard.number >= maxCard.number)
                        return myMaxCard;
                }
                else if (this.hasThisSuitCard(player, this.trump)) {
                    let trumpCard = this.getMaxCardOf(player, this.trump);
                    if (trumpCard && trumpCard.number >= this.getMaxCardFromRemainingCards(this.trump))
                        return trumpCard;

                    let card11: CCard = new CCard();
                    card11.number = 10;
                    card11.suit = this.trump;
                    let maxThanMindi: CCard = this.getMaxCardThan(player, card11);
                    if (maxThanMindi)
                        return maxThanMindi;
                }

                if (mustFollowSuit)
                    return this.getMinCardNotMindiOf(player, followSuit);
                else
                    return this.getLowestCardNotMindi(player);
            }

            let enemyCutId: string = this.enemyCut(followSuit, player.sessionId, player.sessionId);

            if (enemyCutId == null) {
                if (this.partnerCut(followSuit, player.sessionId, player.sessionId) != null) {
                    let mindi: CCard = this.getMindi(player, followSuit, mustFollowSuit);
                    if (mindi)
                        return mindi;
                    else if (mustFollowSuit)
                        return this.getMinCardNotMindiOf(player, followSuit);
                    else
                        return this.getLowestCardNotMindi(player);
                }

                if (this.roundCardsContainMindi(roundCards)) {
                    if (mustFollowSuit) {
                        if (myMaxCard.number >= maxCard.number)
                            return myMaxCard;
                    }
                    else if (this.hasThisSuitCard(player, this.trump)) {
                        let trumpCard: CCard = this.getMinCardOf(player, this.trump);
                        if (trumpCard)
                            return trumpCard;
                    }

                    if (this.hasJoker(player))
                        return this.getRandomSuitCard(player, this.jokerSuit);
                }

                if (maxCard.number < 9) {
                    let card11: CCard = new CCard();
                    card11.number = 10;
                    card11.suit = followSuit;
                    let maxThanMindi: CCard = this.getMaxCardThan(player, card11);
                    if (maxThanMindi)
                        return maxThanMindi;
                }
            }

            if (this.partnerCut(followSuit, enemyCutId, player.sessionId) != null) {
                let mindi: CCard = this.getMindi(player, followSuit, mustFollowSuit);
                if (mindi)
                    return mindi;
                else {
                    if (mustFollowSuit)
                        return this.getMinCardNotMindiOf(player, followSuit);
                    else
                        return this.getLowestCardNotMindi(player);
                }
            }

            if (this.roundCardsContainMindi(roundCards)) {
                if (mustFollowSuit) {
                    if (myMaxCard.number >= maxCard.number)
                        return myMaxCard;
                }
                else if (this.hasThisSuitCard(player, this.trump)) {
                    let trumpCard: CCard = this.getMaxCardOf(player, this.trump);
                    if (trumpCard && trumpCard.number >= this.getMaxCardFromRemainingCards(this.trump))
                        return trumpCard;
                    else if (this.hasJoker(player))
                        return this.getRandomSuitCard(player, this.jokerSuit);
                }

                if (this.hasJoker(player))
                    return this.getRandomSuitCard(player, this.jokerSuit);
            }

            if (mustFollowSuit) {
                if (myMaxCard.number >= maxCard.number) {
                    let maxThanCard: CCard = this.getMaxCardThan(player, maxCard);
                    if (maxThanCard && maxThanCard.number !== 9)
                        return maxThanCard;
                    else
                        return this.getMinCardNotMindiOf(player, followSuit);
                }
            }
            else if (this.hasThisSuitCard(player, this.trump)) {
                let card11: CCard = new CCard();
                    card11.number = 10;
                    card11.suit = this.trump;
                let maxThanMindi: CCard = this.getMaxCardThan(player, card11);
                if (maxThanMindi)
                    return maxThanMindi;
            }

            if (mustFollowSuit)
                return this.getMinCardNotMindiOf(player, followSuit);
            else
                return this.getLowestCardNotMindi(player);
        }
        else {
            if (this.isMyPartner(player.sessionId, maxCard.playerSessionId)) {
                let mindi: CCard = this.getMindi(player, followSuit, mustFollowSuit);
                if (mindi)
                    return mindi;
                else if (mustFollowSuit)
                    return this.getMinCardOf(player, followSuit);
                else
                    return this.getLowestCardNotMindi(player);
            }

            if (this.hasJoker(player))
                return this.getRandomSuitCard(player, this.jokerSuit);

            if (mustFollowSuit)
                return this.getMinCardNotMindiOf(player, followSuit);
            else
                return this.getLowestCardNotMindi(player);
        }
    }

    middleTurnBeforeTrump(player: CPlayer, roundCards: ArraySchema<CCard>) : CCard {
        let firstSuitPlayed: string = roundCards[0].suit;
        let maxCard: CCard = this.determinHighCard(roundCards);
        if (this.hasThisSuitCard(player, firstSuitPlayed)) {
            let myMaxCard: CCard = this.getMaxCardOf(player, firstSuitPlayed);

            if (!this.isMyPartner(player.sessionId, maxCard.playerSessionId)) {
                if (maxCard.number === 0) {
                    if (this.hasJoker(player))
                        return this.getRandomSuitCard(player, this.jokerSuit);
                    else
                        return this.getMinCardNotMindiOf(player, firstSuitPlayed);
                }

                if (this.roundCardsContainMindi(roundCards)) {
                    if (myMaxCard.number >= maxCard.number && myMaxCard.number > this.getMaxCardFromRemainingCards(firstSuitPlayed))
                        return myMaxCard;

                    if (this.hasJoker(player))
                        return this.getRandomSuitCard(player, this.jokerSuit);
                }

                if (maxCard.number < 9) {
                    let card11: CCard = new CCard();
                    card11.number = 10;
                    card11.suit = firstSuitPlayed;
                    let maxThanMindi = this.getMaxCardThan(player, card11);
                    if (maxThanMindi)
                        return maxThanMindi;
                    else
                        return this.getMinCardNotMindiOf(player, firstSuitPlayed);
                }

                if (myMaxCard.number >= maxCard.number || myMaxCard.number > this.getMaxCardFromRemainingCards(firstSuitPlayed)) {
                    if (myMaxCard)
                        return myMaxCard;
                    else
                        return this.getMinCardNotMindiOf(player, firstSuitPlayed);
                }

                return this.getMinCardNotMindiOf(player, firstSuitPlayed);
            }
            else {
                if (maxCard.number === 0) {
                    let mindi: CCard = this.getMindiOf(player, firstSuitPlayed);
                    if (mindi)
                        return mindi;
                    else
                        return this.getMinCardNotMindiOf(player, firstSuitPlayed);
                }
                else {
                    if (maxCard.number < 9) {
                        let card11: CCard = new CCard();
                        card11.number = 10;
                        card11.suit = firstSuitPlayed;
                        let maxThanMindi: CCard = this.getMaxCardThan(player, card11);
                        if (maxThanMindi != null)
                            return maxThanMindi;
                        else
                            return this.getMinCardNotMindiOf(player, firstSuitPlayed);
                    }

                    if (maxCard.number > this.getMaxCardFromRemainingCards(firstSuitPlayed)) {
                        let mindi: CCard = this.getMindiOf(player, firstSuitPlayed);
                        if (mindi)
                            return mindi;
                        else
                            return this.getMinCardNotMindiOf(player, firstSuitPlayed);
                    }
                }

                return this.getMinCardNotMindiOf(player, firstSuitPlayed);
            }
        }
        else if (!this.trumpActive) {
            
            this.trumpActive = true;

            if(!this.noSuitCards[player.sessionId]) {
                this.noSuitCards[player.sessionId] = firstSuitPlayed;
            }

            if (this.mode.toLowerCase() === `hide`) {
                return this.throwTrumpCard(player, firstSuitPlayed);
            }
            else if (this.mode.toLowerCase() === `katte`) {
                return this.chooseTrumpCard(player);
            }
            else {
                return this.getRandomCard(player);
            }
        }
        else {
            if(!this.noSuitCards[player.sessionId]) {
                this.noSuitCards[player.sessionId] = firstSuitPlayed;
            }

            return this.getLowestCardNotMindi(player);
        }
    }

    firstTurnAfterTrump(player: CPlayer) : CCard {
        let suit: string = this.getPartnerCutSuit(player);
        if (suit !== null) {
            return this.getMinCardNotMindiOf(player, suit);
        }

        suit = this.getEnemyNotCutSuit(player);
        if (suit !== null) {
            return this.getMinCardNotMindiOf(player, suit);
        }
      
        let s: string = this.getMinCardSuitNotMindi(player);
        let card: CCard = this.getMinCardNotMindiOf(player, s);
        if (card != null)
            return card;

        if (this.hasThisSuitCard(player, this.trump)) {
            return this.getMinCardNotMindiOf(player, this.trump);
        }

        return this.getRandomCard(player);
    }

    firstTurnBeforeTrump(player: CPlayer) : CCard {
        if (this.roundsCompleted == 0) {
            let suit: string = this.getMinCardWithMindiSuit(player);
            if (!this.lowSuitCards[player.sessionId])
                this.lowSuitCards[player.sessionId] = suit;

            return this.getMinCardNotMindiOf(player, suit);
        }
        else {
            let suit: string = this.getPartersLowCardsSuit(player);
            if (suit !== null && this.hasThisSuitCard(player, suit)) {
                return this.getMinCardNotMindiOf(player, suit);
            }
            
            suit = this.getMinCardSuitNotEnemyLowCards(player);

            if (suit !== null && this.hasThisSuitCard(player, suit)) {
                if (!this.lowSuitCards[player.sessionId])
                this.lowSuitCards[player.sessionId] = suit;

                return this.getMinCardNotMindiOf(player, suit);
            }

            suit = this.getMinCardWithMindiSuit(player);

            if (!this.lowSuitCards[player.sessionId])
                this.lowSuitCards[player.sessionId] = suit;

            return this.getMinCardNotMindiOf(player, suit);
        }
    }

    lastTurnAfterHakam(player: CPlayer, roundCards: ArraySchema<CCard>) : CCard {
        let followSuit: string = roundCards[0].suit;
        let maxCard: CCard = this.determinHighCard(roundCards);

        let mustFollowSuit: boolean = this.hasThisSuitCard(player, followSuit);
        if (!mustFollowSuit) {
            if(!this.noSuitCards[player.sessionId]) {
                this.noSuitCards[player.sessionId] = followSuit;
            }
        }

        if (maxCard.suit == this.trump) {
            if (this.isMyPartner(player.sessionId, maxCard.playerSessionId)) {
                let mindi: CCard = this.getMindi(player, followSuit, mustFollowSuit);
                if (mindi)
                    return mindi;
                else if (mustFollowSuit)
                    return this.getMinCardNotMindiOf(player, followSuit);
                else {
                    let suit: string = this.getMinCardSuitNotMindi(player);
                    return this.getMinCardNotMindiOf(player, suit);
                }
            }

            if (maxCard.number < 9) {
                if (mustFollowSuit)
                    return this.getMinCardNotMindiOf(player, followSuit);
                else {
                    let mindi: CCard = this.getMindiOf(player, this.trump);
                    if (mindi)
                        return mindi;
                }
            }

            if (this.roundCardsContainMindi(roundCards)) {
                if (mustFollowSuit) {
                    if (this.hasJoker(player))
                        return this.getRandomSuitCard(player, this.jokerSuit);

                    return this.getMinCardNotMindiOf(player, followSuit);
                }
                else {
                    let maxThanCard: CCard = this.getMaxCardThan(player, maxCard);
                    if (maxThanCard)
                        return maxThanCard;

                    if (this.hasJoker(player))
                        return this.getRandomSuitCard(player, this.jokerSuit);
                }
            }

            if (mustFollowSuit)
                return this.getMinCardNotMindiOf(player, followSuit);
            else {
                let suit: string = this.getMinCardSuitNotMindi(player);
                return this.getMinCardNotMindiOf(player, suit);
            }
        }
        else if (maxCard.number !== 0) {
            if (this.isMyPartner(player.sessionId, maxCard.playerSessionId)) {
                let mindi: CCard = this.getMindi(player, followSuit, mustFollowSuit);
                if (mindi)
                    return mindi;
                else if (mustFollowSuit)
                    return this.getMinCardNotMindiOf(player, followSuit);
                else {
                    let suit: string = this.getMinCardSuitNotMindi(player);
                    return this.getMinCardNotMindiOf(player, suit);
                }
            }

            if (maxCard.number < 9) {
                if (mustFollowSuit) {
                    let maxThanCard: CCard = this.getMaxCardThan(player, maxCard);
                    if (maxThanCard)
                        return maxThanCard;

                    return this.getMinCardNotMindiOf(player, followSuit);
                }
                else {
                    let mindi: CCard = this.getMindiOf(player, this.trump);
                    if (mindi)
                        return mindi;

                    let trumpCard: CCard = this.getMinCardOf(player, this.trump);
                    if (trumpCard)
                        return trumpCard;
                }
            }

            if (this.roundCardsContainMindi(roundCards)) {
                if (mustFollowSuit) {
                    let maxThanCard: CCard = this.getMaxCardThan(player, maxCard);
                    if (maxThanCard)
                        return maxThanCard;

                    if (this.hasJoker(player))
                        return this.getRandomSuitCard(player, this.jokerSuit);

                    return this.getMinCardNotMindiOf(player, followSuit);
                }
                else {
                    let mindi: CCard = this.getMindiOf(player, this.trump);
                    if (mindi)
                        return mindi;

                    let trumpCard: CCard = this.getMinCardNotMindiOf(player, this.trump);
                    if (trumpCard)
                        return trumpCard;
                }

                if (this.hasJoker(player))
                    return this.getRandomSuitCard(player, this.jokerSuit);
            }

            if (mustFollowSuit) {
                let maxThanCard: CCard = this.getMaxCardThan(player, maxCard);
                if (maxThanCard)
                    return maxThanCard;

                return this.getMinCardNotMindiOf(player, followSuit);
            }
            else {
                let trumpCard: CCard = this.getMinCardOf(player, this.trump);
                if (trumpCard)
                    return trumpCard;
            }

            if (mustFollowSuit)
                return this.getMinCardNotMindiOf(player, followSuit);
            else
                return this.getLowestCardNotMindi(player);
        }
        else {
            if (this.isMyPartner(player.sessionId, maxCard.playerSessionId)) {
                let mindi: CCard = this.getMindi(player, followSuit, mustFollowSuit);
                if (mindi)
                    return mindi;
                else if (mustFollowSuit)
                    return this.getMinCardOf(player, followSuit);
            }

            if (this.hasJoker(player))
                return this.getRandomSuitCard(player, this.jokerSuit);

            if (mustFollowSuit)
                return this.getMinCardNotMindiOf(player, followSuit);
            else {
                let suit: string = this.getMinCardSuitNotMindi(player);
                return this.getMinCardNotMindiOf(player, suit);
            }
        }
    }

    getMindi(player: CPlayer, suit: string, mustFollowSuit: boolean) : CCard {
        return mustFollowSuit ? this.getMindiOf(player, suit) : this.getAnyMindi(player);
    }

    getAnyMindi(player: CPlayer) : CCard {
        let handCards: MapSchema<CCard> = player.cards;
        for(let i = 0; i < this.suits.length; i++) {
            let s: string = this.suits[i];
            let cards: ArraySchema<CCard> = handCards[s];
            if(cards) {
                for(let i = 0; i < cards.length; i++) {
                    if(cards[i].number === 9)
                        return cards[i];
                }
            }
        }
        return null;
    }

    lastTurnBeforeHakam(player: CPlayer, roundCards: ArraySchema<CCard>) : CCard {
        let firstSuitPlayed: string = roundCards[0].suit;
        let maxCard: CCard = this.determinHighCard(roundCards);

        if (this.hasThisSuitCard(player, firstSuitPlayed)) {
            let myMaxCard: CCard = this.getMaxCardOf(player, firstSuitPlayed);
            if (!this.isMyPartner(player.sessionId, maxCard.playerSessionId)) {
                if (maxCard.number === 0) {
                    if (this.hasJoker(player))
                        return this.getRandomSuitCard(player, this.jokerSuit);
                    else
                        return this.getMinCardNotMindiOf(player, firstSuitPlayed);
                }

                if (this.roundCardsContainMindi(roundCards)) {
                    if (myMaxCard.number >= maxCard.number) {
                        let maxThanCard: CCard = this.getMaxCardThan(player, maxCard);
                        if (maxThanCard)
                            return maxThanCard;
                        else
                            return maxCard;
                    }

                    if (this.hasJoker(player))
                        return this.getRandomSuitCard(player, this.jokerSuit);
                }

                if (maxCard.number < 9) {
                    let mindi: CCard = this.getMindiOf(player, firstSuitPlayed);
                    if (mindi)
                        return mindi;

                    return this.getMinCardNotMindiOf(player, firstSuitPlayed);
                }

                if (myMaxCard.number >= maxCard.number) {
                    let maxThanCard: CCard = this.getMaxCardThan(player, maxCard);
                    if (maxThanCard)
                        return maxThanCard;
                    else
                        return maxCard;
                }

                return this.getMinCardNotMindiOf(player, firstSuitPlayed);
            }
            else
            {
                let mindi: CCard = this.getMindiOf(player, firstSuitPlayed);
                if (mindi)
                    return mindi;
                else
                    return this.getMinCardOf(player, firstSuitPlayed);
            }
        }
        else if (!this.trumpActive)
        {
            this.trumpActive = true;

            if(!this.noSuitCards[player.sessionId]) {
                this.noSuitCards[player.sessionId] = firstSuitPlayed;
            }

            if (this.mode.toLowerCase() === `hide`)
            {
                return this.throwTrumpCard(player, firstSuitPlayed);
            }
            else if (this.mode.toLowerCase() === `katte`)
            {
                return this.chooseTrumpCard(player);
            }
            else
            {
                let suit: string = this.getMinCardSuitNotMindi(player);
                return this.getMinCardNotMindiOf(player, suit);
            }
        }
        else
        {
            if(!this.noSuitCards[player.sessionId]) {
                this.noSuitCards[player.sessionId] = firstSuitPlayed;
            }

            let suit: string = this.getMinCardSuitNotMindi(player);
            return this.getMinCardNotMindiOf(player, suit);
        }
    }

    chooseTrumpCard(player: CPlayer) : CCard {
        let maxSuitCount: number = 0;
        let suit: string = this.suits[0];
        let handCards: MapSchema<CCard> = player.cards;

        for(let i = 0; i < this.suits.length; i++) {
            let s: string = this.suits[i];
            if (handCards[s] && handCards[s].length > maxSuitCount) {
                maxSuitCount = handCards[s].length;
                suit = s;
            }
        }

        this.trump = suit;
        if (this.enemyCut(suit, player.sessionId, player.sessionId) == null) {
            let mindi: CCard = this.getMindiOf(player, suit);
            if (mindi) {
                mindi.isTrump = true;
                return mindi;
            }
            else {
                let trumpCard: CCard = handCards[suit][0];
                trumpCard.isTrump = true;
                return trumpCard;
            }
        }

        let trumpCard: CCard = handCards[suit][0];
        trumpCard.isTrump = true;
        return trumpCard;
    }

    throwTrumpCard(player: CPlayer, firstSuitPlayed: string) : CCard {
        let handCards: MapSchema<CCard> = player.cards;
        if (this.hasThisSuitCard(player, this.trump)) {
            if (this.enemyCut(firstSuitPlayed, player.sessionId, player.sessionId) == null) {
                let mindi: CCard = this.getMindiOf(player, this.trump);
                if (mindi) {
                    mindi.isTrump = true;
                    return mindi;
                }
                else {
                    let trumpCard: CCard = handCards[this.trump][0];
                    trumpCard.isTrump = true;
                    return trumpCard;
                }
            }
            else {
                let trumpCard: CCard = handCards[this.trump][0];
                trumpCard.isTrump = true;
                return trumpCard;
            }
        }
        else {
            return this.getLowestCardNotMindi(player);
        }
    }

    getLowestCardNotMindi(player: CPlayer) : CCard {
        let card: CCard = null;
        let minRank: number = 13;
        let handCards: MapSchema<CCard> = player.cards;

        for(let i = 0; i < this.suits.length; i++) {
            let s: string = this.suits[i];
            if (s !== this.trump && handCards[s] && handCards[s].length > 0) {
                let minCard: CCard = this.getMinCardNotMindiOf(player, s);
                if (minCard && minCard.number !== 9) {
                    if (minCard.number < minRank) {
                        minRank = minCard.number;
                        card = minCard;
                    }
                }
            }
        }
        if (card != null)
            return card;

        for(let i = 0; i < this.suits.length; i++) {
            let s: string = this.suits[i];
            if (s !== this.trump && handCards[s] && handCards[s].length > 0) {
                let minCard: CCard = this.getMinCardNotMindiOf(player, s);
                if (minCard && minCard.number !== 9) {
                    card = minCard;
                }
            }
        }
        if (card != null)
            return card;

        for(let i = 0; i < this.suits.length; i++) {
            let s: string = this.suits[i];
            if (handCards[s] && handCards[s].length > 0) {
                let minCard: CCard = this.getMinCardNotMindiOf(player, s);
                if (minCard && minCard.number !== 9) {
                    card = minCard;
                }
            }
        }

        if (!card) {
            let suit: string = this.getMinCardSuit(player);
            card = this.getMinCardNotMindiOf(player, suit);
        }

        return card;
    }

    getMaxCardFromRemainingCards(suit: string) : number {
        if(this.remainingCards[suit] && this.remainingCards[suit].length > 0) {
            let cards: ArraySchema<CCard> = this.remainingCards[suit];
            return cards && cards[cards.length - 1] && cards[cards.length - 1].number;
        }
        return 0;
    }

    getMinCardSuit(player: CPlayer) : string {
        let suit: string = null;
        let min: number = 13;
        let handCards: MapSchema<CCard> = player.cards;

        for(let i = 0; i < this.suits.length; i++) {
            let s: string = this.suits[i];
            if (handCards[s] && handCards[s].length != 0 && handCards[s].length < min 
                && !this.isAllMindiIn(s, handCards) && s != this.trump) {
                min = handCards[s].length;
                suit = s;
            }
        }
        if (suit != null)
            return suit;

        min = 13;
        for(let i = 0; i < this.suits.length; i++) {
            let s: string = this.suits[i];
            if (handCards[s] && handCards[s].length != 0 && handCards[s].length < min 
                && s != this.trump) {
                min = handCards[s].length;
                suit = s;
            }
        }
        if (suit != null)
            return suit;

        min = 13;
        for(let i = 0; i < this.suits.length; i++) {
            let s: string = this.suits[i];
            if (handCards[s] && handCards[s].length != 0 && handCards[s].length < min) {
                min = handCards[s].length;
                suit = s;
            }
        }
        return suit;
    }

    getMindiOf(player: CPlayer, suit: string) : CCard {
        let handCards: ArraySchema<CCard> = player.cards[suit];
        if(handCards) {
            for(let i = 0; i < handCards.length; i++) {
                if(handCards[i].number === 9)
                    return handCards[i];
            }
        }
        return null;
    }

    getMaxCardThan(player: CPlayer, card: CCard) : CCard {
        let handCards: ArraySchema<CCard> = player.cards[card.suit];
        if(handCards) {
            for(let i = 0; i < handCards.length; i++) {
                if(handCards[i].number >= card.number)
                    return handCards[i];
            }
        }
        return null;
    }

    roundCardsContainMindi(roundCards: ArraySchema<CCard>) : boolean {
        if(roundCards) {
            for(let i = 0; i < roundCards.length; i++) {
                if(roundCards[i].number === 9) {
                    return true;
                }
            }
        }
        return false;
    }

    hasJoker(player: CPlayer) : boolean {
        let handCards: MapSchema<CCard> = player.cards;
        return handCards[this.jokerSuit] && handCards[this.jokerSuit].length > 0;
    }

    isMyPartner(sessionId: string, partnerSessionId: string) : boolean {
        if(this.teamA.players[sessionId]) {
            if(this.teamA.players[partnerSessionId]) {
                return true;
            }
        }
        else {
            if(this.teamB.players[partnerSessionId]) {
                return true;
            }
        }
        return false;
    }

    getMinCardOf(player: CPlayer, suit: string) : CCard {
        let handCards: ArraySchema<CCard> = player.cards[suit];
        let minCard: CCard = null;
        if(handCards) {
            minCard = handCards[0];
            for(let i = 1; i < handCards.length; i++) {
                if(handCards[i].number < minCard.number) {
                    minCard = handCards[i];
                }
            }
        }
        return minCard;
    }

    getMaxCardOf(player: CPlayer, suit: string) : CCard {
        let handCards: ArraySchema<CCard> = player.cards[suit];
        let maxCard: CCard = null;
        if(handCards) {
            maxCard = handCards[0];
            for(let i = 1; i < handCards.length; i++) {
                if(handCards[i].number > maxCard.number) {
                    maxCard = handCards[i];
                }
            }
        }
        return maxCard;
    }

    getMinCardSuitNotEnemyLowCards(player: CPlayer) : string {
        let suit: string = null;
        let min: number = 13;
        let handCards: MapSchema<CCard> = player.cards;

        for(let i = 0; i < this.suits.length; i++) {
            let s: string = this.suits[i];
            if (handCards[s] && handCards[s].length != 0 && handCards[s].length < min && !this.isEnemyLowCards(player.sessionId, s)) {
                min = handCards[s].length;
                suit = s;
            }
        }
        return suit;
    }

    isEnemyLowCards(sessionId: string, suit: string) : boolean {
        let enIds: string[] = this.getRemainingEnemyIds(sessionId);
        for(let i = 0; i < enIds.length; i++) {
            if(this.lowSuitCards[enIds[i]] === suit) {
                return true;
            }
        }
        return false;
    }

    getPartersLowCardsSuit(player: CPlayer) : string {
        let cards: MapSchema<CCard> = player.cards;
        let s: string = null;
        for(let suit in cards) {
            let prIds: string[] = this.getRemainingPartnerIds(player.sessionId);
            for(let i = 0; i < prIds.length; i++) {
                if(this.lowSuitCards[prIds[i]] === suit) {
                    s = suit;
                }
            }
        }
        return s;
    }

    getMinCardWithMindiSuit(player: CPlayer) : string {
        let suit: string = null;
        let min: number = 13;
        let handCards: MapSchema<CCard> = player.cards;

        for(let i = 0; i < this.suits.length; i++) {
            let s: string = this.suits[i];
            if (handCards[s] && handCards[s].length != 0 && handCards[s].length < min) {
                min = handCards[s].length;
                suit = s;
            }
        }
        return suit;
    }

    getMinCardSuitNotMindi(player: CPlayer) : string {
        let suit: string = null;
        let min: number = 13;
        let handCards: MapSchema<CCard> = player.cards;

        //check if we have min card suit that is not trump & has notMindi Card
        for(let i = 0; i < this.suits.length; i++) {
            let s: string = this.suits[i];
            if (handCards[s] && handCards[s].length != 0 && handCards[s].length < min 
                && !this.isAllMindiIn(s, handCards) && s !== this.trump) {
                min = handCards[s].length;
                suit = s;
            }
        }
        if (suit !== null)
            return suit;


        //check if we have trump that has notMindi card
        for(let i = 0; i < this.suits.length; i++) {
            let s: string = this.suits[i];
            if (handCards[s] && handCards[s].length != 0 && handCards[s].length < min 
                && !this.isAllMindiIn(s, handCards)) {
                min = handCards[s].length;
                suit = s;
            }
        }
        if (suit !== null)
            return suit;

        //check if we have all mindi cards
        for(let i = 0; i < this.suits.length; i++) {
            let s: string = this.suits[i];
            if (handCards[s] && handCards[s].length != 0 && handCards[s].length < min) {
                min = handCards[s].length;
                suit = s;
            }
        }

        if (suit !== null)
            return suit;

        return suit;
    }

    isAllMindiIn(suit: string, handCards: MapSchema<CCard>) : boolean {
        let cards: ArraySchema<CCard> = handCards[suit];
        if(cards) {
            for(let i = 0; i < cards.length; i++) {
                if(cards[i].number !== 9) {
                    return false;
                }
            }
        }
        return true;
    }

    getMinCardNotMindiOf(player: CPlayer, suit: string) : CCard {
        let cards: ArraySchema<CCard> = player.cards[suit];

        if(cards) {
            for(let i = 0; i < cards.length; i++) {
                if(cards[i].number !== 9)
                    return cards[i];
            }
        }
        return null;
    }

    getEnemyNotCutSuit(player: CPlayer) : string {
        for(let i = 0; i < this.suits.length; i++) {
            if(this.suits[i] !== this.trump && this.hasThisSuitCard(player, this.suits[i])) {
                if(this.enemyCut(this.suits[i], player.sessionId, player.sessionId) == null) {
                    return this.suits[i];
                }
            }
        }
        return null;
    }

    getPartnerCutSuit(player: CPlayer) : string {

        if (this.playerCount == 4)
            return this.getPartnerCutSuit4Player(player);
        else if (this.playerCount == 6)
            return this.getPartnerCutSuit6Player(player);

        return null;
    }

    getPartnerCutSuit4Player(player: CPlayer) : string {
        let suit: string = null;
        let prIds: string[] = this.getRemainingPartnerIds(player.sessionId);
        let enIds: string[] = this.getRemainingEnemyIds(player.sessionId);

        for(let i = 0; i < this.suits.length; i++) {
            if(this.suits[i] !== this.trump && this.hasThisSuitCard(player, this.suits[i])) {
                if(this.isCut(this.suits[i], prIds[0]) && !this.isCut(this.suits[i], enIds[1])) {
                    suit = this.suits[i];
                }
            }
        }
        return suit;
    }

    getPartnerCutSuit6Player(player: CPlayer) : string {
        let suit: string = null;
        var prIds = this.getRemainingPartnerIds(player.sessionId);
        var enIds = this.getRemainingEnemyIds(player.sessionId);

        // check for first partner
        for(let i = 0; i < this.suits.length; i++) {
            if(this.suits[i] !== this.trump && this.hasThisSuitCard(player, this.suits[i])) {
                if (this.isCut(this.suits[i], prIds[0])) {
                    if (this.enemyCut(this.suits[i], prIds[0], player.sessionId) == null) {
                        suit = this.suits[i];
                    }
                    else {
                        if (this.isCut(this.suits[i], enIds[1])) {
                            if (this.isCut(this.suits[i], prIds[1]) && this.isCut(this.suits[i], enIds[2])) {
                                suit = this.suits[i];
                            }
                        }
                    }
                }
            }
        }

        if (suit !== null)
            return suit;

        //check for second partner
        for(let i = 0; i < this.suits.length; i++) {
            if(this.suits[i] !== this.trump && this.hasThisSuitCard(player, this.suits[i])) {
                if(this.isCut(this.suits[i], prIds[1]) && !this.isCut(this.suits[i], enIds[2])) {
                    suit = this.suits[i];
                }
            }
        }

        return suit;
    }

    getRemainingPartnerIds(sessionId: string) : string[] {
        let prIds: string[] = [];
        if(this.teamA.players[sessionId]) {
            for(let id in this.teamA.players) {
                if(this.curRoundPlayedPlayers.indexOf(id) == -1 && sessionId !== id) {
                    prIds.push(id);
                }
            }
        }
        else {
            for(let id in this.teamB.players) {
                if(this.curRoundPlayedPlayers.indexOf(id) == -1 && sessionId !== id) {
                    prIds.push(id);
                }
            }
        }
        return prIds;
    }

    getRemainingEnemyIds(sessionId: string) : string[] {
        let enIds: string[] = [];
        if(this.teamA.players[sessionId]) {
            for(let id in this.teamB.players) {
                if(this.curRoundPlayedPlayers.indexOf(id) == -1) {
                    enIds.push(id);
                }
            }
        }
        else {
            for(let id in this.teamA.players) {
                if(this.curRoundPlayedPlayers.indexOf(id) == -1) {
                    enIds.push(id);
                }
            }
        }
        return enIds;
    }

    hasThisSuitCard(player: CPlayer, suit: string) : boolean {
        return player.cards[suit] && player.cards[suit].length > 0;
    }

    isCut(suit: string, sessionId: string) : boolean {
        let noSuits: string[] = this.noSuitCards[sessionId];
        if(!noSuits) {
            noSuits = [];
        }
        return noSuits.indexOf(suit) !== -1 && noSuits.indexOf(this.trump) === -1;
    }

    enemyCut(suit: string, sessionId: string, curSessionId: string) : string {
        let enIds: string[] = this.getRemainingEnemyIds(sessionId);

        for(let i = 0; i < enIds.length; i++) {
            if(enIds[i] !== curSessionId) {
                if(this.isCut(suit, enIds[i])) {
                    return enIds[i];
                }
            }
        }
        return null;
    }

    partnerCut(suit: string, sessionId: string, curSessionId: string) : string {
        let prIds: string[] = this.getRemainingPartnerIds(sessionId);

        for(let i = 0; i < prIds.length; i++) {
            if(prIds[i] !== curSessionId) {
                if(this.isCut(suit, prIds[i])) {
                    return prIds[i];
                }
            }
        }
        return null;
    }
}