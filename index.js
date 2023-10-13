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

let authors = [
  {
    name: 'Robert Martin',
    id: "afa51ab0-344d-11e9-a414-719c6709cf3e",
    born: 1952,
  },
  {
    name: 'Martin Fowler',
    id: "afa5b6f0-344d-11e9-a414-719c6709cf3e",
    born: 1963
  },
  {
    name: 'Fyodor Dostoevsky',
    id: "afa5b6f1-344d-11e9-a414-719c6709cf3e",
    born: 1821
  },
  { 
    name: 'Joshua Kerievsky', // birthyear not known
    id: "afa5b6f2-344d-11e9-a414-719c6709cf3e",
  },
  { 
    name: 'Sandi Metz', // birthyear not known
    id: "afa5b6f3-344d-11e9-a414-719c6709cf3e",
  },
]

/*
 * Suomi:
 * Saattaisi olla järkevämpää assosioida kirja ja sen tekijä tallettamalla kirjan yhteyteen tekijän nimen sijaan tekijän id
 * Yksinkertaisuuden vuoksi tallennamme kuitenkin kirjan yhteyteen tekijän nimen
 *
*/ 

let books = [
  {
    title: 'Clean Code',
    published: 2008,
    author: 'Robert Martin',
    id: "afa5b6f4-344d-11e9-a414-719c6709cf3e",
    genres: ['refactoring']
  },
  {
    title: 'Agile software development',
    published: 2002,
    author: 'Robert Martin',
    id: "afa5b6f5-344d-11e9-a414-719c6709cf3e",
    genres: ['agile', 'patterns', 'design']
  },
  {
    title: 'Refactoring, edition 2',
    published: 2018,
    author: 'Martin Fowler',
    id: "afa5de00-344d-11e9-a414-719c6709cf3e",
    genres: ['refactoring']
  },
  {
    title: 'Refactoring to patterns',
    published: 2008,
    author: 'Joshua Kerievsky',
    id: "afa5de01-344d-11e9-a414-719c6709cf3e",
    genres: ['refactoring', 'patterns']
  },  
  {
    title: 'Practical Object-Oriented Design, An Agile Primer Using Ruby',
    published: 2012,
    author: 'Sandi Metz',
    id: "afa5de02-344d-11e9-a414-719c6709cf3e",
    genres: ['refactoring', 'design']
  },
  {
    title: 'Crime and punishment',
    published: 1866,
    author: 'Fyodor Dostoevsky',
    id: "afa5de03-344d-11e9-a414-719c6709cf3e",
    genres: ['classic', 'crime']
  },
  {
    title: 'The Demon ',
    published: 1872,
    author: 'Fyodor Dostoevsky',
    id: "afa5de04-344d-11e9-a414-719c6709cf3e",
    genres: ['classic', 'revolution']
  },
]

const typeDefs = `
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
      if (bookExist) {
        throw new GraphQLError('Title must be unique', {
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
          throw new GraphQLError('Adding new author failed', {
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