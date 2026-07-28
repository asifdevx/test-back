import { GraphQLString ,GraphQLNonNull,GraphQLSchema,GraphQLObjectType} from "graphql";
import {UserFullInfoType} from "../types/userProfile.type"
import {getUserFullInfo} from "../../mongoDb/controllers/c.profile";



const RootQuery = new GraphQLObjectType ({
  name:"UserQuery",
  fields:{
    getUserFullInfo :{
      type: UserFullInfoType,
      args: {
        address: { type: new GraphQLNonNull(GraphQLString) } // required
      },
      resolve: async (_, { address }) => {
      
        return await getUserFullInfo(address);
      }
    }
  }
})
export const UserFullInfo = new GraphQLSchema({
  query: RootQuery,

});