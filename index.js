const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
// const port = process.env.PORT;
const app = express();

//middleware
app.use(cors());
app.use(express.json());


function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}

const validateId = (req, res, next) => {
    const id = req.params.id;
    const objectIdRegex = /^(?=[a-f\d]{24}$)(\d+[a-f]|[a-f]+\d)/i;
    const validId = objectIdRegex.test(id);

    if (!id || !validId) {
        return res.send({ success: false, error: 'Invalid id' });
    }

    req.id = id;

    next();
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wtas1.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const productCollection = client.db('modernTools').collection('products');
        const bookingCollection = client.db('modernTools').collection('bookings');
        const userCollection = client.db("modernTools").collection("users");
        const ratingCollection = client.db("modernTools").collection("ratings");

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            } else {
                res.status(403).send({ message: 'Forbidden Access' })
            }
        }

        //AUTH
        app.post('/login', async (req, res) => {
            const user = req.body;
            const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1d'
            });
            res.send({ accessToken })
        })


        // POST
        app.post('/products', async (req, res) => {
            const product = req.body;

            if (!product.name || !product.email || !product.image || !product.description || !product.price || !product.quantity || !product.minimum) {
                return res.send({ success: false, error: "Please Provide all Information" })
            }

            const result = await productCollection.insertOne(product);
            res.send({ success: true, message: `Successfully inserted ${product.name}` })
        })

        app.post('/bookings', async (req, res) => {
            const bookings = req.body;

            if (!bookings.name || !bookings.email || !bookings.product || !bookings.phone || !bookings.price || !bookings.address) {
                return res.send({ success: false, error: "Please Provide all Information" })
            }

            const result = await bookingCollection.insertOne(bookings);
            res.send({ success: true, message: `Successfully inserted ${bookings.name}` })
        })



        // Get

        app.get('/products', async (req, res) => {
            const query = {};
            const cursor = productCollection.find(query);
            const users = await cursor.toArray();
            res.send(users);
        })
        app.get('/bookings', async (req, res) => {
            const query = {};
            const cursor = bookingCollection.find(query);
            const users = await cursor.toArray();
            res.send(users);
        })

        app.get('/product/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const product = await productCollection.findOne(query);
            res.send(product);
        })

        // update quantity
        app.put('/product/:id', async (req, res) => {
            const id = req.params.id;
            const updatedQuantity = req.body.updatedQuantity;
            const price = req.body.price;
            // console.log(updatedQuantity);
            const filter = { _id: ObjectId(id) };
            console.log(filter);
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    quantity: updatedQuantity,
                    price: price
                }
            };
            const result = await productCollection.updateOne(filter, updatedDoc, options);
            console.log(updatedDoc);
            res.send(result);

        })

        app.delete("/products/:id", validateId, async (req, res) => {
            const id = req.id;
            const result = await productCollection.deleteOne({ _id: ObjectId(id) })
            console.log(result)

            if (!result.deletedCount) {
                return res.send({ success: false, error: "something went wrong" });
            }

            res.send({ success: true, message: "Successfully deleted " })

        });

        app.delete("/bookings/:id", validateId, async (req, res) => {
            const id = req.id;
            const result = await bookingCollection.deleteOne({ _id: ObjectId(id) })
            console.log(result)

            if (!result.deletedCount) {
                return res.send({ success: false, error: "something went wrong" });
            }

            res.send({ success: true, message: "Successfully deleted " })

        });

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' })
            res.send({ result, token });
        })

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })


        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);

        });

        app.get('/myitem', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const email = req.query.email;
            if (email === decodedEmail) {
                const query = { email: email };
                const cursor = bookingCollection.find(query);
                const myItem = await cursor.toArray();
                res.send(myItem);
            } else {
                res.status(403).send({ message: 'Forbidden Access' })
            }
        })

        app.post('/ratings', async (req, res) => {
            const rating = req.body;
            const result = await ratingCollection.insertOne(rating);
            res.send(result);
        });
        app.get('/ratings', async (req, res) => {
            const query = {};
            const cursor = ratingCollection.find(query);
            const ratings = await cursor.toArray();
            res.send(ratings);
        })


    }
    catch (error) {
        console.log(error);
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Running server');
});

app.listen(port, () => {
    console.log('Listening to port', port);
});