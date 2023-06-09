import express from "express"
import cors from 'cors'
import { MongoClient, ObjectId } from "mongodb"
import dotenv from 'dotenv'
import dayjs from "dayjs"
import Joi from "joi"

const app = express()
app.use(cors())
app.use(express.json())
dotenv.config()

//Conexão com o Banco
let db
const mongoClient = new MongoClient(process.env.DATABASE_URL)
mongoClient.connect()
    .then(() => db = mongoClient.db())
    .catch((err) => res.status(500).send(err.message))

//Validação joi
const participantSchema = Joi.object({
    name: Joi.string().min(1).required(),
});
const mensagemSchema = Joi.object({
    from: Joi.string().required(),
    to: Joi.string().min(1).required(),
    text: Joi.string().min(1).required(),
    type: Joi.string().valid("message", "private_message").required(),
    time: Joi.string()
})
const limitSchema = Joi.object({

})
//rotas
app.post("/participants", async (req, res) => {
    const participant = req.body

    
    const validacao = participantSchema.validate(participant, {
        abortEarly: false
    })
    if(validacao.error) {
        const erros = validacao.error.details.map((detail) => detail.message)
        return res.status(422).send(erros)
    }
    try {
        const participantExist = await db.collection("participants").findOne({name: participant.name})
        if(participantExist) {
            return res.sendStatus(409)
        }
        await db.collection("participants").insertOne({
            name: participant.name,
            lastStatus: Date.now()
        })
        await db.collection("messages").insertOne({
            from: participant.name,
            to: "Todos",
            text: "entra na sala...",
            type: "status",
            time: dayjs().format("HH:mm:ss")
        })
        res.send(201)
    } 
    catch(error) {
        res.status(500).send(error.message)
    }
    
        
}) 
app.get("/participants", async (req, res) => {
    try {
        const participants = await db.collection("participants").find().toArray()
        if(!participants) {
            return res.status(404).send("Nenhum participante adicionado!")
        }
        res.send(participants)
    }   catch (error){
        res.status(500).send(error.message)
    }
})
app.post("/messages", async (req, res) => {
    const { to, text, type } = req.body
    const { user } = req.headers
    try {
        const message = {
            from: user,
            to,
            text,
            type,
            time: dayjs().format("HH:mm:ss")
        }
        const validacao = mensagemSchema.validate(message, {
            abortEarly: false
        })
        if(validacao.error) {
            const erros = validacao.error.details.map((detail) => detail.message)
            return res.status(422).send(erros)
        }
        const participantExist = await db.collection("participants").findOne({name: user})
        if(!participantExist) {
            return res.send(422)
        }
        await db.collection("messages").insertOne(message)
        res.send(201)
    } catch (error) {
        res.status(500).send(error.message)
    }
})
app.get("/messages", async (req, res) => {
    const limit = parseInt(req.query.limit)
    const  { user } = req.headers
    
    try {
        const messages = await db.collection("messages").find().toArray()
        const filterMessages = messages.filter(msg => {
            const { from, to, type } = msg
            const canRead = to === "Todos" || from === user || to === user
            const isPublic = type === "message"
            return canRead || isPublic
        })
        if(limit && limit !== NaN && limit > 0 || typeof limit === 'string') {
            return res.send(filterMessages.slice(-limit))
        } else if(isNaN(limit) || limit <= 0){
            return res.sendStatus(422)
        } else {
            res.send(filterMessages)
        }
        
    } catch (error) {
        res.status(500).send(error.message)
    }
})
app.post("/status", async (req, res) => {
    const {user} = req.headers
    try {
        const participantExist = await db.collection("participants").findOne({name: user})
        if(!participantExist) {
            return res.sendStatus(404)
        }
        await db.collection("participants").updateOne({name: user}, {$set: {lastStatus: Date.now()}})
        res.sendStatus(200)
    } catch(error) {
        res.status(500).send(error.message)
    }
})
app.delete("/messages/:id", async (req, res) => {
    const user = req.headers.user
    const {id} = req.params
    try{
        const messages = await db.collection("messages")
        const messageExist = await messages.findOne({_id: new ObjectId(id)})
        if(!messageExist) {
            return res.sendStatus(404)
        }
        if(messageExist.from !== user) {
            return res.sendStatus(401)
        }
        await messages.deleteOne({
            _id: messageExist._id
        })
        res.sendStatus(200)
    } catch(error) {
        res.sendStatus(500)
    }
})
app.put("/messages/:id", async (req, res) => {
    const {to, text, type} = req.body
    const {from} = req.headers
    const {id} = req.params

    const message = {
        to: to,
        text: text,
        type: type,
    }
    const validacao = mensagemSchema.validate(message)
    if(validacao.error) {
        return res.sendStatus(422)
    }
    try {
        const collecPart = mongoClient.collection("participants")
        const collecMes = mongoClient.collection("messages")
        const participantExist = await collecPart.findOne({name: from})
        if(!participantExist) {
            return res.sendStatus(422)
        }
        const messageExist = await collecMes.findOne({_id: new ObjectId(id)})
        if(!messageExist) {
            return res.sendStatus(404)
        }
        if(messageExist.from !== from) {
            return res.sendStatus(401)
        }
        await collecMes.updateOne({
            _id: new ObjectId(id)
            }, {
                $set: message
            })
        res.sendStatus(200)
    } catch(error) {
        res.status(500).send(error.message)
    }
})

setInterval(async() => {
    const segundos = Date.now() - 10 * 1000

    try {
        const partInative = await db.collection("participants").find({lastStatus: {$lte: segundos}}).toArray()
        if(partInative.length > 0) {
            const mesInative = partInative.map(part => {
                return {
                    from: part.name,
                    to: "Todos",
                    text: "sai da sala...",
                    type: "status",
                    time: dayjs().format("HH:mm:ss"),
                }
            })
            await db.collection("messages").insertMany(mesInative)
            await db.collection("participants").deleteMany({lastStatus: {$lte: segundos}})
        }
    } catch(err){
        res.status(500).send(err.message)
    }
}, 15000)

const PORT = 5000
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`))