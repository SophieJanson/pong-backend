import { 
  JsonController, Authorized, CurrentUser, Post, Param, BadRequestError, HttpCode, NotFoundError, ForbiddenError, Get, Patch, Body 
} from 'routing-controllers'
import User from '../users/entity'
import { Game, Player } from './entities'
// import {calculateWinner, finished} from './logic'
// import { Validate } from 'class-validator'
import {io} from '../index'
import {gameData}  from './gamedata'

// class GameUpdate {

//   @Validate(IsBoard, {
//     message: 'Not a valid board'
//   })
//   board: Board
// }

@JsonController()
export default class GameController {
  newGameData: Object = gameData
  @Authorized()
  @Post('/games')
  @HttpCode(201)
  async createGame(
    @CurrentUser() user: User
  ) {
    const entity = await Game.create().save()

    await Player.create({
      game: entity, 
      user,
      paddle: 'left',
      score: 0
    }).save()

    const game = await Game.findOneById(entity.id)

    io.emit('action', {
      type: 'ADD_GAME',
      payload: game
    })
    this.newGameData = gameData
    return ({
      ...game,
      position: this.newGameData
    })
  }

  @Authorized()
  @Post('/games/:id([0-9]+)/players')
  @HttpCode(201)
  async joinGame(
    @CurrentUser() user: User,
    @Param('id') gameId: number
  ) {
    const game = await Game.findOneById(gameId)
    if (!game) throw new BadRequestError(`Game does not exist`)
    if (game.status !== 'pending') throw new BadRequestError(`Game is already started`)

    game.status = 'started'
    await game.save()

    const player = await Player.create({
      game, 
      user,
      paddle: 'right',
      score: 0
    }).save()

    io.emit('action', {
      type: 'UPDATE_GAME_STATUS',
      payload: await Game.findOneById(game.id)
    })

    return player
  }

  @Authorized()
  // the reason that we're using patch here is because this request is not idempotent
  // http://restcookbook.com/HTTP%20Methods/idempotency/
  // try to fire the same requests twice, see what happens
  @Patch('/games/:id([0-9]+)')
  async updateGame(
    @CurrentUser() user: User,
    @Param('id') gameId: number,
    @Body() update: Object
  ) {
    const game = await Game.findOneById(gameId)
    if (!game) throw new NotFoundError(`Game does not exist`)

    const player = await Player.findOne({ user, game })
    console.log("PLAYER", player)
    if (!player) throw new ForbiddenError(`You are not part of this game`)
    if (game.status !== 'started') throw new BadRequestError(`The game is not started yet`) 
    if(update['vx'] || update['vy'] || update['left'] || update['right']) {
      this.newGameData= {
        ...this.newGameData,
        ...update
      }

      io.emit('action', {
        type: 'UPDATE_GAME',
        payload: {
          id: gameId,
          ...this.newGameData
        }
      })
    }

  if(update['score']) {
    switch(update['score']) {
      case 'left':
        if(player.paddle === 'left') player.score ++
        break;
      case 'right':
        if(player.paddle === 'right') player.score ++
        break;
      default:
        break;
    }

    player.save()

    io.emit('action', {
      type: 'UPDATE_GAME_STATUS',
      payload: await Game.findOneById(game.id)
    })
  }

    // const winner = calculateWinner(update.board)
    // if (winner) {
    //   game.winner = winner
    //   game.status = 'finished'
    // }
    // else if (finished(update.board)) {
    //   game.status = 'finished'
    // }
    // else {
    //   // game.turn = player.symbol === 'x' ? 'o' : 'x'
    // }
    // game.board = update.board
    await game.save()
    return game
  }

  @Authorized()
  @Get('/games/:id([0-9]+)')
  getGame(
    @Param('id') id: number
  ) {
    return Game.findOneById(id)
  }

  @Authorized()
  @Get('/games')
  async getGames(
    @CurrentUser() user: User
  ) {
    const games = await Game.find({where: {players: {userId: user.id}}})
    const resGames = games
      .filter(game => {
        console.log("game", game)
        return (game.players.length < 2 || game.players.filter(player => player.userId === user.id).length === 1)
      })
    return await resGames
  }
}

