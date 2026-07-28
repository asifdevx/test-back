import {
  GraphQLBoolean,
  GraphQLObjectType,
  GraphQLString,
} from "graphql";







export const userBasicInfo = new GraphQLObjectType({
  name: "Profile",
  fields: {
    address: { type: GraphQLString },
    displayName: { type: GraphQLString },
    bio: { type: GraphQLString },
    email: { type: GraphQLString },
    avatarUrl: { type: GraphQLString },
    bannerUrl: { type: GraphQLString },
    country: { type: GraphQLString },

    links: {
      type: new GraphQLObjectType({
        name: "SocialLinks",
        fields: {
          x: { type: GraphQLString },
          instagram: { type: GraphQLString },
          website: { type: GraphQLString },
        },
      }),
    },
    verified: { type: GraphQLBoolean },
    createdAt: { type: GraphQLString },
  },
});
export const userKycInfo = new GraphQLObjectType({
  name: "Kyc",
  fields: {
    status: { type: GraphQLString },

    personalInfo: {
      type: new GraphQLObjectType({
        name: "KycPersonalInfo",
        fields: {
          firstName: { type: GraphQLString },
          lastName: { type: GraphQLString },
          country: { type: GraphQLString },
          state: { type: GraphQLString },
          city: { type: GraphQLString },
          streetAddress: { type: GraphQLString },
          postalCode: { type: GraphQLString },
          passPortId: { type: GraphQLString },
          socialSecurity: { type: GraphQLString },
          nationality: { type: GraphQLString },
          dob: { type: GraphQLString },
        },
      }),
    },
    documents: {
      type: new GraphQLObjectType({
        name: "KycDocuments",
        fields: {
          nidFront: {
            type: new GraphQLObjectType({
              name: "KycNidFront",
              fields: {
                status: { type: GraphQLString },
                notes: { type: GraphQLString },
              },
            }),
          },
          utilityBill: {
            type: new GraphQLObjectType({
              name: "KycUtilityBill",
              fields: {
                status: { type: GraphQLString },
                notes: { type: GraphQLString },
              },
            }),
          },
          selfieWithId: {
            type: new GraphQLObjectType({
              name: "KycSelfieWithId",
              fields: {
                status: { type: GraphQLString },
                notes: { type: GraphQLString },
              },
            }),
          },
        },
      }),
    },
  },
});

export const UserFullInfoType = new GraphQLObjectType({
  name:"UserFullInfo",
fields:{
  profile:{type :userBasicInfo},
  kyc:{type:userKycInfo}
}
})