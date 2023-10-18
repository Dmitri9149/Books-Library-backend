const { ApolloServer } = require('@apollo/server')
const { startStandaloneServer } = require('@apollo/server/standalone')
const { v1: uuid } = require('uuid')
const { GraphQLError } = require('graphql')


const mongoose = require('mongoose')
mongoose.set('strictQuery', false)
const Author = require('./models/author')
const Book = require('./models/book')

require('dotenv').config()

const MONGODB_URI = process.env.MONGODB_URI

console.log('connecting to', MONGODB_URI)

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch((error) => {
    console.log('error connection to MongoDB:', error.message)
  })

const typeDefs = `
  type User {
    username: String!
    id: ID!
  }
  type Token {
    value: String!
  }
  type Book {
    title: String!
    author: Author!
    published: Int!
    genres: [String!]!
    id: ID! 
  }
  type Author {
    name: String!
    born: Int
    bookCount: Int
    id: ID!
  }
  type Query {
    authorCount: Int!
    bookCount: Int!
    allBooks(author: String, genre: String): [Book!]!
    allAuthors: [Author!]!
    me: User
  }
  type Mutation {
    addBook(
      title: String!
      author: String!
      published: Int!
      genres: [String!]!
    ): Book
    addAuthor(
      name: String!
      born: Int
    ): Author
    editAuthor(
      name: String!
      born: Int!
    ) : Author
    createUser(
        username: String!
    ) : User
    login(
        username: String!
        password: String!
    ) : Token
  }
`

const resolvers = {
  Query: {
    bookCount: async () => Book.collection.countDocuments(),
    authorCount: async () => Author.collection.countDocuments(),
    allBooks: async (root, args) => {
      const author = await Author.findOne({ name: args.author })
      if(args.author && args.genres) {
        return Book.find({author:author.id, genres:{$in:[args.genre]}}).populate('author')
      } else if (args.author) {
        return Book.find({author:author.id}).populate('author')
      } else if (args.genre) {
        return Book.find({genres:{$in:[args.genre]}}).populate('author')
      } else { 
        return Book.find({}).populate('author')
      }
    },
    allAuthors: async () => Author.find({})
  },
  Author: {
    bookCount: async (root) => {
      const author = await Author.findOne({name:root.name})
      console.log("author", author)
      console.log("root author", root.name)
      const booksQuantity = await Book.find({ author: author.id }).countDocuments({})
      return booksQuantity
    }
  },
  Mutation: {
    addBook: async (root, args) => {
      const bookExist = await Book.findOne({title:args.title})
      if (bookExist || args.title.length < 5 || args.author.length < 4) {
        throw new GraphQLError 
        ('Title must be unique and with length min 5 chars, author name min 4 chars', {
          extensions: {
            code: 'BAD_USER_INPUT',
            invalidArgs: args.title
          }
        })
      }
      const currentAuthor = await Author.findOne({name:args.author})
      if(!currentAuthor) {
        const newAuthor = new Author({ name: args.author })
        try {
          await newAuthor.save()
        } 
        catch(error) {
          throw new GraphQLError('Adding new author failed or author name is too short', {
            extensions: {
              code:'BAD_USER_INPUT',
              invalidArgs: args,
              error
            }
          })
        }
      }
      const savedAuthor = await Author.findOne({ name: args.author })
      const book = new Book({ ...args, author:savedAuthor.id})   
      await book.save()
      const newBook = await Book.findById(book.id).populate('author')
      return newBook
    },
    editAuthor: async (root, args) => {
      const author = await Author.findOne({name: args.name})
      if (!author) {return null}
      author.born = args.born
      return author.save()
    }
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
})

startStandaloneServer(server, {
  listen: { port: 4000 },
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
})