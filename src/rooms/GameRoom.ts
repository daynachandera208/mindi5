import { Room, Client } from 'colyseus';
import { ArraySchema, MapSchema } from '@colyseus/schema';
import { GameState } from '../state/GameState';
import { CPlayer } from '../state/CPlayer';
import { CCard } from '../state/CCard';
import { Team } from '../state/Team';
import { CardUtils } from '../utils/CardUtils';
import { BotUtils } from '../utils/BotUtils';
import { DbUtils } from '../utils/DbUtils';

export class GameRoom extends Room<GameState> {

    playerCount: number = 0;    // Player Count

    cardUtils: CardUtils;       // Utils providing helper methods for Cards

    botUtils: BotUtils;         // Utils providing Bot support if a player leaves

    gameStarted: boolean = false;

    activePlayerSeat: number = -1;

    totalMindi: number = 0;

    reqWinMindi: number = 0;

    players: MapSchema<CPlayer> = new MapSchema<CPlayer>();

    playerTurnWait: boolean = false;

    // Create the Room
    onCreate(options: any) {
        console.log(`Room ${this.roomName} created with roomId ${this.roomId}`);

        // Setup Helper class objects
        this.cardUtils = new CardUtils();
        this.botUtils = new BotUtils();

        // Set state
        this.setState(new GameState());

        // Set the game properties
        // mode, totalDecks & joker
        this.state.mode = options.mode;
        this.state.totalDecks = options.totalDecks;
        this.state.jokerActive = options.joker;
        this.botUtils.jokerActive = options.joker;
        this.botUtils.mode = options.mode;


        this.totalMindi = this.state.totalDecks * 4;
        this.reqWinMindi = (this.totalMindi / 2) + 1;

        // Set maxClients
        switch(this.state.totalDecks) {
            case 1:
            case 2:
                this.maxClients = 4;
                break;
            case 3:
                this.maxClients = 6;
                break;
            case 4:
                this.maxClients = 8;
                break;
            default:
                console.log(`Invalid number of decks provided!!!`);
        }

        // Set message handlers
        this.initializeMessageHandlers();
    }

    // New Player Joins the Room
    onJoin(client: Client, options: any) {
        console.log(`Server: Client joined with sessionId ${client.sessionId}`);

        // Create a new Player and add him to a team
        this.addPlayer(client.sessionId, options.name);

        // Increment the playerCount
        this.playerCount += 1;

        if(this.playerCount == 1) {
            setTimeout(() => {
                this.addRemaningBots();
            }, Number(process.env.USER_WAIT_SEC) || 30000);
        }

        // Lock the room when maxClients entered
        if (this.playerCount == this.maxClients) {
            console.log(`${this.roomId} Room Locked!!`);
            this.lock();
        }
    }

    // Existing Player Leaves the Room
    async onLeave(client: Client, consented: boolean) {
        console.log(
            `Server: Client left with sessionId ${client.sessionId}`
        );

        try {
            // If consented, remove without wait
            if (consented) {
                this.removePlayer(client.sessionId);
            }
            else {
                // Allow reconnection if exited due to internet or device connectivity issue for 5 mins
                this.setPlayerConnected(client.sessionId, false);
                await this.allowReconnection(client, 300);
                this.setPlayerConnected(client.sessionId, true);
                console.log(`Client with sessionId ${client.sessionId} successfully reconnected!!`);
            }

        } catch (e) {
            console.log(`Player has not reconnected, removing from Room`);
            this.removePlayer(client.sessionId);
        }
    }

    // Destroy the Room
    onDispose() {
        console.log(`${this.roomName} Room with id ${this.roomId} Disposed!!`);
    }

    // Initialize all the message handler to be handled from Client
    initializeMessageHandlers() {

        // `distribute` - Distributes the card
        this.onMessage(`distribute`, (client, message) => {
            if(this.playerCount === this.maxClients && this.state.deck.length === 0)
                this.distributeCards();
        });

        // `start` - Send by Client to start the game
        this.onMessage(`start`, (client, message) => {
            if(this.playerCount === this.maxClients && this.locked && !this.gameStarted) {
                this.startGame();
                this.gameStarted = true;
            }
        });

        // `turn` - Send from Client & Has details of card played and trump or not
        this.onMessage(`turn`, (client, message) => {
            if(this.playerTurnWait) {
                this.playerTurnWait = false;

                let card: CCard = new CCard();
                card.number = message.card.number;
                card.suit = message.card.suit;
                card.playerSessionId = message.card.playerSessionId;

                this.playTheTurn(card, message.isTrump);
            }
        });

        // Called only in Hide mode
        // Set the trump and uses it only when 
        this.onMessage(`hideCard`, (client, card) => {
            this.playTheHideCard(client.sessionId, card);
        });

        // Called only in Hide mode
        // When hidden card is revealed
        this.onMessage(`openHideCard`, (client, message) => {
            this.playTheOpenHideCard(client.sessionId);
        });

        // Called if the user clicks Next ROund after a game
        this.onMessage(`nextRound`, (client, message) => {
            console.log(`Next Round clicked by ${this.players[client.sessionId].name}`);
            let newPlayer: CPlayer = this.getExistingPlayer(this.players[client.sessionId].seat, this.players[client.sessionId].name, client.sessionId);
            if((newPlayer.seat + 1) % 2 != 0) {
                this.state.teamA.players[client.sessionId] = newPlayer;
            }
            else {
                this.state.teamB.players[client.sessionId] = newPlayer;
            }

            this.playerCount += 1;

            let bots: string[] = Object.keys(this.botUtils.bots);
            for(let i = 0; i < bots.length; i++) {
                console.log(`Bot added in Next Round click ${this.players[bots[i]].name}`);
                let botPlayer: CPlayer = this.getExistingPlayer(this.players[bots[i]].seat, this.players[bots[i]].name, bots[i]);
                if((botPlayer.seat + 1) % 2 != 0) {
                    this.state.teamA.players[bots[i]] = botPlayer;
                }
                else {
                    this.state.teamB.players[bots[i]] = botPlayer;
                }
                this.botUtils.bots[bots[i]] = botPlayer;
                this.playerCount += 1;
            }

            console.log(`PlayerCount in Next Round click ${this.playerCount}`);

            if(this.playerCount === this.maxClients) {
                setTimeout( () => {
                    this.broadcast(`addPlayers`);
                }, 2000);
            }
            else {
                client.send(`waiting`, this.playerCount);
            }
        });
    }

    // Starts the Game when all players have joined
    startGame() {

        // Set variables required in BotUtils
        this.botUtils.playerCount = this.playerCount;
        this.botUtils.teamA = this.state.teamA;
        this.botUtils.teamB = this.state.teamB;

        // Set first player as activePlayer
        this.activePlayerSeat = 0;

        // Send a `chooseTrump` event if the game mode is Hide for start player to choose
        if(this.state.mode.toLowerCase() === `hide`) {
            let hideCard : CCard = this.botHideCard();
            if(hideCard == null) {
                this.broadcast(`chooseTrump`, this.getPlayerFromSeat(this.activePlayerSeat).sessionId);
            }
            else {
                this.playTheHideCard(this.getPlayerFromSeat(this.activePlayerSeat).sessionId, hideCard);
            }
        }
        else {
            // Check if Bot
            if(!this.playBotTurn(false)) {
                // Send a `play` event to client with activePlayerId
                this.broadcast(`play`, this.getPlayerFromSeat(this.activePlayerSeat).sessionId);

                // Start a timer for this turn
                // Select a card using bot logic if the player does not choose within wait time
                this.playerTurnWait = true;
                setTimeout(() => {
                    if(this.playerTurnWait && this.gameStarted) {
                        this.playerTurnWait = false;
                        console.log(`Player with Seat ${this.activePlayerSeat} did not play, making a bot move for same`);
                        // Use bot logic and select a Card
                        // Send turnCard to all client with selected card
                        this.playBotTurn(true);
                    }
                }, Number(process.env.USER_PLAY_WAIT_SEC) || 50000);
            }
        }
    }

    // Adds a player to the room
    addPlayer(sessionId: string, name: string) {
        let newPlayer: CPlayer = new CPlayer();
        newPlayer.connected = true;
        newPlayer.seat = this.playerCount;
        newPlayer.sessionId = sessionId;
        newPlayer.name = name;

        if((newPlayer.seat + 1) % 2 != 0) {
            this.state.teamA.players[sessionId] = newPlayer;
        }
        else {
            this.state.teamB.players[sessionId] = newPlayer;
        }
        
        this.players[sessionId] = newPlayer;
        console.log(`New Player ${newPlayer.sessionId} added Successfully!!`);
    }

    addRemaningBots() {
        if(this.playerCount == 0) {
            return;
        }

        if(this.maxClients - this.playerCount <= 2) {
            console.log(`Other players didn't join, creating ${this.maxClients - this.playerCount} bots to start game`)
            if(this.playerCount < this.maxClients) {
                this.lock();
                let actualPlayerCount: number = this.playerCount;
                for(let i = 0; i < this.maxClients - actualPlayerCount; i++) {
                    let botSessionId: string = this.botUtils.makeId(9);
                    this.addPlayer(botSessionId, `Bot${this.playerCount}`);
                    this.playerCount += 1;

                    if(this.state.teamA.players[botSessionId]) {
                        this.botUtils.addBot(botSessionId, this.state.teamA.players[botSessionId]);
                    }
                    else {
                        this.botUtils.addBot(botSessionId, this.state.teamB.players[botSessionId]);
                    }
                }
            }
        }
        else {
            this.broadcast(`noPlayers`, `Players are not available`);
        }
    }

    getExistingPlayer(seat: number, name: string, sessionId: string) : CPlayer {
        let newPlayer: CPlayer = new CPlayer();
        newPlayer.seat = seat;
        newPlayer.sessionId = sessionId;
        newPlayer.name = name;
        return newPlayer;
    }

    // Removes a player from the room
    removePlayer(sessionId: string) {
        if(Object.keys(this.botUtils.bots).length + 1 === this.maxClients) {
            this.gameStarted = false;
            return;
        }

        if(this.gameStarted) {
            console.log(`Entered playBotTurn in removePlayer`);
            if(this.state.teamA.players[sessionId]) {
                this.botUtils.addBot(sessionId, this.state.teamA.players[sessionId]);
            }
            else {
                this.botUtils.addBot(sessionId, this.state.teamB.players[sessionId]);
            }

            this.playBotTurn(false);
        }
        else {
            console.log(`Entered else block in removePlayer, playerCount = ${this.playerCount}`);
            let newPlayer: CPlayer = this.getExistingPlayer(this.players[sessionId].seat, this.players[sessionId].name, sessionId);
            if((newPlayer.seat + 1) % 2 != 0) {
                this.state.teamA.players[sessionId] = newPlayer;
            }
            else {
                this.state.teamB.players[sessionId] = newPlayer;
            }
            this.botUtils.addBot(sessionId, newPlayer);
            this.playerCount += 1;

            if(this.playerCount == this.maxClients) {
                setTimeout( () => {
                    this.broadcast(`addPlayers`);
                }, 2000);
            }
        }

        console.log(`${sessionId} Player removed, Bot added!!`);
    }

    // Distribute the Cards
    distributeCards() {

        // Create and shuffle the deck
        let deck: ArraySchema<CCard> = this.cardUtils.getDeck(this.state.totalDecks, this.state.jokerActive);
        console.log(`Decks = ${this.state.totalDecks}, Cards length = ${deck.length}`);

        for(let i = 0; i < 13; i++) {

            for(let j = 1; j <= this.playerCount; j++) {
                let card: CCard = deck.pop();
                if(j % 2 != 0) {
                    this.addCardToTeamA(j, card);
                }
                else {
                    this.addCardToTeamB(j, card);
                }
            }
        }
        
    }

    // Distribute Card to TeamA Player
    addCardToTeamA(seat: number, card: CCard) {
        for(let id in this.state.teamA.players) {
            let player: CPlayer = this.state.teamA.players[id]
            if(player.seat + 1 === seat) {
                card.playerSessionId = player.sessionId;
                if(!player.cards[card.suit]) {
                    player.cards[card.suit] = new ArraySchema<CCard>();
                }
                player.cards[card.suit].push(card);

                // Add card to botUtils
                if(this.botUtils[id]) {
                    let botPlayer: CPlayer = this.botUtils[id];
                    if(!botPlayer.cards[card.suit]) {
                        botPlayer.cards[card.suit] = new ArraySchema<CCard>();
                    }
                    botPlayer.cards[card.suit].push(card);
                }
                if(!this.botUtils.remainingCards[card.suit]) {
                    this.botUtils.remainingCards[card.suit] = new ArraySchema<CCard>();
                }
                this.botUtils.remainingCards[card.suit].push(card);

                // Add card to deck which is monitored by client
                this.state.deck.push(card);
                break;
            }
        }
    }

    // Distribute Card to TeamB Player
    addCardToTeamB(seat: number, card: CCard) {
        for(let id in this.state.teamB.players) {
            let player: CPlayer = this.state.teamB.players[id]
            if(player.seat + 1 === seat) {
                card.playerSessionId = player.sessionId;
                if(!player.cards[card.suit]) {
                    player.cards[card.suit] = new ArraySchema<CCard>();
                }
                player.cards[card.suit].push(card);

                // Add card to botUtils
                if(this.botUtils[id]) {
                    let botPlayer: CPlayer = this.botUtils[id];
                    if(!botPlayer.cards[card.suit]) {
                        botPlayer.cards[card.suit] = new ArraySchema<CCard>();
                    }
                    botPlayer.cards[card.suit].push(card);
                }
                if(!this.botUtils.remainingCards[card.suit]) {
                    this.botUtils.remainingCards[card.suit] = new ArraySchema<CCard>();
                }
                this.botUtils.remainingCards[card.suit].push(card);

                // Add card to deck which is monitored by client
                this.state.deck.push(card);
                break;
            }
        }
    }

    playTheTurn(card: CCard, isTrump: boolean) {
        // Increment turnsCompleted
        this.state.turnsCompleted += 1;

        // Add Card to round card
        this.state.roundCards.push(card);
        this.populateNoCards(card);
        this.removePlayerCard(card.playerSessionId, card);

        // Trump is active
        if(isTrump && !this.state.trumpActive) {
            this.state.trumpActive = true;
            this.state.trump = card.suit;
            card.isTrump = true;
            this.botUtils.trumpActive = true;
            this.botUtils.trump = card.suit;
        }

        // Update Mindi Count
        if(card.number === 9) {
            this.state.roundMindis += 1;
        }

        this.broadcast(`turnCard`, card);

        setTimeout( () => {
            // Check if round is completed
            if(this.state.turnsCompleted === this.playerCount) {
                this.roundComplete();
            }
            else {
                // Update activePlayerIndex to next player if round not started
                this.activePlayerSeat = (this.activePlayerSeat + 1) % (this.playerCount);

                if(!this.playBotTurn(false)) {
                    // Send a `play` event to client with activePlayerId
                    this.broadcast(`play`, this.getPlayerFromSeat(this.activePlayerSeat).sessionId);

                    // Start a timer for this turn
                    // Select a card using bot logic if the player does not choose within wait time
                    this.playerTurnWait = true;
                    setTimeout(() => {
                        if(this.playerTurnWait && this.gameStarted) {
                            this.playerTurnWait = false;
                            console.log(`Player with Seat ${this.activePlayerSeat} did not play, making a bot move for same`);
                            // Use bot logic and select a Card
                            // Send turnCard to all client with selected card
                            this.playBotTurn(true);
                        }
                    }, Number(process.env.USER_PLAY_WAIT_SEC) || 50000);
                }
            }

        }, 2000);
    }

    playTheHideCard(sessionId : string, card: CCard) {
        this.state.trump = card.suit;
        this.botUtils.trump = card.suit;
        this.broadcast(`hideCard`, card);

        setTimeout( () => {
            if(!this.playBotTurn(false)) {
                // Send a `play` event to client with activePlayerId
                this.broadcast(`play`, sessionId);

                // Start a timer for this turn
                // Select a card using bot logic if the player does not choose within wait time
                this.playerTurnWait = true;
                setTimeout(() => {
                    if(this.playerTurnWait && this.gameStarted) {
                        this.playerTurnWait = false;
                        console.log(`Player with Seat ${this.activePlayerSeat} did not play, making a bot move for same`);
                        // Use bot logic and select a Card
                        // Send turnCard to all client with selected card
                        this.playBotTurn(true);
                    }
                }, Number(process.env.USER_PLAY_WAIT_SEC) || 50000);
            }
        }, 2000);
    }

    playTheOpenHideCard(sessionId: string) {
        this.state.trumpActive = true;
        this.broadcast(`openHideCard`, sessionId);
    }

    // Determine the winning Team
    // Send `gameComplete` event with winning team details
    determineWinners() : boolean {
        let winningTeamPlayerSessionId: string = null;
        let isMindiKot: boolean = false;
        if (this.state.teamA.totalMindis >= this.reqWinMindi && this.state.teamB.totalMindis != 0 && this.state.teamB.totalMindis < this.reqWinMindi)
        {
            winningTeamPlayerSessionId = Object.keys(this.state.teamA.players)[0];
        }
        else if (this.state.teamA.totalMindis != 0 && this.state.teamA.totalMindis < this.reqWinMindi && this.state.teamB.totalMindis >= this.reqWinMindi)
        {
            winningTeamPlayerSessionId = Object.keys(this.state.teamB.players)[0];
        }
        else if (this.state.teamA.totalMindis == (this.totalMindi / 2) && this.state.teamB.totalMindis == (this.totalMindi / 2))
        {
            if (this.state.teamA.totalHands > this.state.teamB.totalHands)
                winningTeamPlayerSessionId = Object.keys(this.state.teamA.players)[0];
            else if (this.state.teamA.totalHands < this.state.teamB.totalHands)
                winningTeamPlayerSessionId = Object.keys(this.state.teamB.players)[0];
        }
        else if (this.state.teamA.totalMindis == (this.totalMindi / 2) && this.state.teamB.totalMindis != 0 && this.state.teamA.totalHands >= 7)
        {
            winningTeamPlayerSessionId = Object.keys(this.state.teamA.players)[0];
        }
        else if (this.state.teamB.totalMindis == (this.totalMindi / 2) && this.state.teamA.totalMindis != 0 && this.state.teamB.totalHands >= 7)
        {
            winningTeamPlayerSessionId = Object.keys(this.state.teamB.players)[0];
        }
        else if (this.state.teamA.totalMindis == this.totalMindi && this.state.teamB.totalMindis == 0)
        {
            winningTeamPlayerSessionId = Object.keys(this.state.teamA.players)[0];
            isMindiKot = true;
        }
        else if (this.state.teamB.totalMindis == this.totalMindi && this.state.teamA.totalMindis == 0)
        {
            winningTeamPlayerSessionId = Object.keys(this.state.teamB.players)[0];
            isMindiKot = true;
        }

        if(winningTeamPlayerSessionId != null) {
            if(isMindiKot == true) {
                this.broadcast(`mindikot`, winningTeamPlayerSessionId);
            }

            this.broadcast(`gameComplete`, winningTeamPlayerSessionId);
            return true;
        }

        if(this.state.roundsCompleted === 13) {
            if(this.state.teamA.totalMindis === this.state.teamB.totalMindis) {
                if(this.state.teamA.totalHands > this.state.teamB.totalHands) {
                    winningTeamPlayerSessionId = Object.keys(this.state.teamA.players)[0];
                }
                else {
                    winningTeamPlayerSessionId = Object.keys(this.state.teamB.players)[0];   
                }
            }
            else {
                if(this.state.teamA.totalMindis > this.state.teamB.totalMindis) {
                    winningTeamPlayerSessionId = Object.keys(this.state.teamA.players)[0];
                }
                else {
                    winningTeamPlayerSessionId = Object.keys(this.state.teamB.players)[0];   
                }
            }

            this.broadcast(`gameComplete`, winningTeamPlayerSessionId);
            return true;
        }

        return false;
    }

    // Logic to be performed when a round has completed
    // All players have dealt the cards
    roundComplete() {
        
        console.log(`Round ${this.state.roundsCompleted} =================`);
        
        // Decide the turn Winner
        let highCard: CCard = this.cardUtils.determinHighCard(this.state.roundCards, this.state.jokerActive, this.state.trumpActive, this.state.trump);

        // Increment hand and mindis for winning Team
        let highPlayer: CPlayer = this.getPlayerFromSessionId(highCard.playerSessionId);
        let highTeam: Team = this.state.teamA.players[highCard.playerSessionId] ? this.state.teamA : this.state.teamB;
        highTeam.totalHands += 1;
        highTeam.totalMindis += this.state.roundMindis;

        // Update activePlayerIndex if round started
        this.activePlayerSeat = highPlayer.seat;

        // Reset state fields
        this.state.turnsCompleted = 0;
        this.state.roundMindis = 0;
        this.state.roundCards = new ArraySchema<CCard>();

        // Increment round count
        this.state.roundsCompleted += 1;
        this.botUtils.roundsCompleted += 1;

        // Send `roundComplete` event to Client with Winning Team details
        this.broadcast(`roundComplete`, highPlayer.sessionId);

        setTimeout( () => {
            // Check if we have a winner
            if(this.determineWinners() == false) {
                // Check if Bot
                if(!this.playBotTurn(false)) {
                    // Send a `play` event to client with activePlayerId if there is no winner yet
                    this.broadcast(`play`, this.getPlayerFromSeat(this.activePlayerSeat).sessionId);

                    // Start a timer for this turn
                    // Select a card using bot logic if the player does not choose within wait time
                    this.playerTurnWait = true;
                    setTimeout(() => {
                        if(this.playerTurnWait && this.gameStarted) {
                            this.playerTurnWait = false;
                            console.log(`Player with Seat ${this.activePlayerSeat} did not play, making a bot move for same`);
                            // Use bot logic and select a Card
                            // Send turnCard to all client with selected card
                            this.playBotTurn(true);
                        }
                    }, Number(process.env.USER_PLAY_WAIT_SEC) || 50000);
                }
            }
            else {
                this.resetGame();
            }
        }, 2000);
    }

    // Get the player from sessionId
    getPlayerFromSessionId(sessionId: string) : CPlayer {
        return this.state.teamA.players[sessionId] ? this.state.teamA.players[sessionId] : this.state.teamB.players[sessionId];
    }

    setPlayerConnected(sessionId: string, value: boolean) {
        if(this.state.teamA.players[sessionId]) {
            this.state.teamA.players[sessionId].connected = value;
        }
        else {
            this.state.teamB.players[sessionId].connected = value;
        }
    }

    // Get the player from seat number
    getPlayerFromSeat(seat: number) : CPlayer {
        for(let id in this.state.teamA.players) {
            if(this.state.teamA.players[id].seat === seat) {
                return this.state.teamA.players[id];
            }
        }

        for(let id in this.state.teamB.players) {
            if(this.state.teamB.players[id].seat === seat) {
                return this.state.teamB.players[id];
            }
        }
    }

    removePlayerCard(sessionId: string, card: CCard) {
        let player = this.state.teamA.players[sessionId];
        if(!player) {
            player = this.state.teamB.players[sessionId];
        }

        let cs: ArraySchema<CCard> = player.cards[card.suit];
        for(let i = 0; i < cs.length; i++) {
            if(cs[i].number === card.number && cs[i].suit === card.suit) {
                player.cards[card.suit].splice(i, 1);
                break;
            }
        }

        // Remove form remaining Cards
        this.botUtils.removeFromRemainingCards(card);
    }

    playBotTurn(isPlayer: boolean) : boolean {
        let player: CPlayer = this.getPlayerFromSeat(this.activePlayerSeat);
        if(this.botUtils.isBotTurn(this.activePlayerSeat) || isPlayer || !player.connected) {
            let card: CCard = this.botUtils.getBotTurnCard(player, this.state.roundCards);
            if(this.botUtils.trumpActive && !this.state.trumpActive) {
                this.state.trumpActive = true;
                if(this.state.mode.toLowerCase() == `hide`) {
                    this.playTheOpenHideCard(player.sessionId);
                }
                else {
                    this.state.trump = card.suit;
                }
            }

            this.playTheTurn(card, card.isTrump);
            return true;
        }
        return false;
    }

    botHideCard() : CCard {
        if(this.botUtils.isBotTurn(this.activePlayerSeat)) {
            return this.botUtils.chooseHideCard(this.getPlayerFromSeat(this.activePlayerSeat));
        }
        return null;
    }

    resetGame() {
        this.gameStarted = false;
        this.playerCount = 0;
        this.state.turnsCompleted = 0;
        this.state.roundsCompleted = 0;
        this.state.roundMindis = 0;
        this.state.trumpActive = false;
        this.state.trump = '';
        this.state.roundCards = new ArraySchema<CCard>();
        this.state.deck = new ArraySchema<CCard>();
        this.state.teamA = new Team();
        this.state.teamB = new Team();
        this.botUtils.resetBotData();
    }

    populateNoCards(card: CCard) {
        if(this.state.roundCards.length > 0) {
            let firstCardSuit: string = this.state.roundCards[0].suit;
            if(card.suit !== firstCardSuit) {
                this.botUtils.noSuitCards[card.playerSessionId] = card.suit;
            }
        }
    }
}