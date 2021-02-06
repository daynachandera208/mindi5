import { ArraySchema } from '@colyseus/schema';
import { CCard } from '../state/CCard';

//Utility class for Cards
export class CardUtils {	
	jokerActive = false;

	suits = [
		'Heart',
		'Spade',
		'Club',
		'Diamond'
	];

	//These varaibles are just for refrence of how the card numbers are used by the back-end server
	//These are never used
	cardFaces = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
	cardNumbers = {
		1:'2',
		2:'3',
		3:'4',
		4:'5',
		5:'6',
		6:'7',
		7:'8',
		8:'9',
		9:'10',
		10:'J',
		11:'Q',
		12:'K',
		13:'A'
	};

    // Get random position for a card
	randomizePosition = (min: number, max: number) : number => {
		min = Math.ceil(min);
		max = Math.floor(max);
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

    // Shuffle the deck
	getShuffledCards = (deck: ArraySchema<CCard>) : ArraySchema<CCard> => {
		let shuffledDeck = new ArraySchema<CCard>();
		let deckLength = deck.length;
		for (let i = 0; i < deckLength; i++) {
			if (i === deckLength - 1) {
				// Fill last undefined slot when only 1 card left to shuffle
				const lastSlot = shuffledDeck.findIndex((val) => val == undefined);
				shuffledDeck[lastSlot] = deck.pop();
			}
			else {
				let shuffleToPosition = this.randomizePosition(0, deckLength - 1);
				while (shuffledDeck[shuffleToPosition]) {
					shuffleToPosition = this.randomizePosition(0, deckLength - 1);
				}
				shuffledDeck[shuffleToPosition] = deck.pop();
			}
		}
		return shuffledDeck;
	}

    // Create and return the deck based on totalDecks selected on the client side
	getDeck = (totalDecks: number, jokerActive: boolean) : ArraySchema<CCard> => {
		this.jokerActive = jokerActive;

		switch(totalDecks) {
			case 1:
				return this.createDeck(1, 1, false);
			case 2:
				return this.createDeck(2, 7, true);
			case 3:
				return this.createDeck(3, 7, false);
			case 4:
				return this.createDeck(4, 7, true);
			default:
				console.log(`Deck not supported = ${totalDecks}`);
		}
	}

	// Creates a deck based on the number of decks and other logic from the client
	createDeck(decks: number, startNum: number, removeAndAdd: boolean) : ArraySchema<CCard> {
		let deck: ArraySchema<CCard> = new ArraySchema<CCard>();

		for(let i = 0; i < decks; i++) {
			this.suits.forEach(suit => {
				for(let num = startNum; num < 14; num++) {
					deck.push(this.getCard(num, suit));
				}
			});
			startNum = decks === 4 ? ( i >= 1 ? 8 : startNum) : 8;
		}

		// Add Joker if needed
		if(this.jokerActive) {
			if(removeAndAdd) {
				for(let i = 0; i < decks - 1; i++) {
					deck.shift();
				}
				
				for(let i = 0; i < decks - 1; i++) {
					deck.unshift(this.getJokerCard());
				}
			}
			else {
				// 3 Deck logic
				if(decks === 3) {
					deck.push(this.getJokerCard());
					deck.push(this.getJokerCard());
				}
			}
		}
		else {
			// 3 Deck logic
			//add 8 of heart , spade
			if(decks === 3) {
				deck.push(this.getCard(7, 'Heart'));
				deck.push(this.getCard(7, 'Spade'));
			}
		}

		return this.getShuffledCards(deck);
	}

	// Creates and returns a Card object with suit, number and face
	getCard = (num: number, suit: string) : CCard => {
		let card: CCard = new CCard();
		card.number = num;
		card.suit = suit;
		card.face = this.cardNumbers[num];
		return card;
	}

	getJokerCard = () => {
		let card: CCard = new CCard();
		card.number = 0;
		card.suit = 'Joker';
		card.face = '0';
		return card;
	}

    // Determine the High card from curHigh and curPlayed cards
    determinHighCard = (roundCards: ArraySchema<CCard>, jokerActive: boolean, trumpActive: boolean, trump: string) : CCard => {
		console.log(`Cards = ${JSON.stringify(roundCards)}`);
		
		let highCard: CCard = null;

		// If joker included, check for joker
		if(jokerActive) {
			roundCards.forEach(card => {
				if(card.number == 0) {
					highCard = card;
				}
			});

			if(highCard != null) {
				console.log(`High Card = ${JSON.stringify(highCard)}`);
				return highCard;
			}
		}

		let highNum: number = 0;
		// If trump is active, find highest trump
		if(trumpActive) {
			roundCards.forEach(card => {
				if(card.suit == trump && card.number >= highNum) {
					highNum = card.number;
					highCard = card;
				}
			});

			if(highCard != null) {
				console.log(`High Card = ${JSON.stringify(highCard)}`);
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

		console.log(`High Card = ${JSON.stringify(highCard)}`);
		return highCard;
    }
}