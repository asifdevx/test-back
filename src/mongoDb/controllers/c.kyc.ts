import * as T from "../../types/index";
import { Kyc } from "../schemas/kyc.schema";
import { Profile, User } from "../schemas/sch.userProfile";

export const submitKyc = async ({ address, personalInfo, documents }: T.KycDetails) => {
  const userAddress = address.toLowerCase();
  let kyc = await Kyc.findOne({ address: userAddress });

  const docKeys = ["nidFront", "utilityBill", "selfieWithId"] as const;

  if (!kyc) {
    // NEW SUBMISSION
    kyc = new Kyc({
      address: userAddress,
      personalInfo,
      documents: {
        nidFront: { value: documents.nidFront.value, status: "pending" },
        utilityBill: { value: documents.utilityBill.value, status: "pending" },
        selfieWithId: { value: documents.selfieWithId.value, status: "pending" },
      },
    });
  } else {
    kyc.personalInfo = { ...kyc.personalInfo, ...personalInfo };

    for (const key of docKeys) {
      const incomingDoc = documents[key];
      const existingDoc = kyc.documents[key];

      if (incomingDoc?.value) {
        if (!existingDoc || existingDoc.status === "rejected" || existingDoc.status === "needs_info" || existingDoc.status === "pending") {
          kyc.documents[key] = {
            value: incomingDoc.value,
            status: "pending",
            notes: "",
          };
        }
      }
    }
  }

  // Calculate the global status based on individual doc statuses
  if (typeof kyc.recalculateStatus === "function") {
    kyc.recalculateStatus();
  }

  await kyc.save();
  return kyc;
};
export const adminReview = async ({ address, documents }: T.IKyc) => {
  let kyc = await Kyc.findOne({ address });
  if (!kyc) return null;

  for (const key in documents) {
    if (documents[key] && kyc.documents && kyc.documents[key]) {
      kyc.documents[key].status = documents[key].status;
      kyc.documents[key].notes = documents[key].notes || "";
    }
  }
  if (typeof kyc.recalculateStatus === "function") {
    kyc.recalculateStatus();
  }
  await kyc.save();
  return kyc;
};

export const getKycByAddress = async (address: string) => {
  return await Kyc.findOne({ address: address.toLowerCase() });
};

export const getRecentKyc = async () => await Kyc.find().sort({ updatedAt: -1 }).limit(50);

export const adminUpdateKyc = async ({ address, documents }: { address: string; documents: T.IKyc["documents"] }) => {
  const userAddress = address.toLowerCase();

  const [kyc, user] = await Promise.all([Kyc.findOne({ address: userAddress }), User.findOne({ address: userAddress }).select("role")]);

  if (!kyc) throw new Error("KYC record not found");
  if (!user) throw new Error("User not found");

  let isModified = false;

  for (const [key, value] of Object.entries(documents)) {
    if (!value) continue;

    const docKey = key as keyof T.IKyc["documents"];
    const current = kyc.documents[docKey];

    if (current.status !== value.status || (value.notes && current.notes !== value.notes)) {
      kyc.documents[docKey] = {
        ...current,
        status: value.status,
        notes: value.notes ?? current.notes,
      };

      isModified = true;
    }
  }

  if (isModified && typeof kyc.recalculateStatus === "function") {
    kyc.recalculateStatus();
  }

  const isApproved = kyc.status === "approved";

  const shouldPromoteToCreator = isApproved && user.role === "user";

  await Promise.all([
    Profile.findOneAndUpdate({ address: userAddress }, { verified: isApproved }, { upsert: true }),

    User.findOneAndUpdate(
      { address: userAddress },
      {
        $set: {
          kyc: kyc._id,
          isVerified: isApproved,
          ...(shouldPromoteToCreator && { role: "creator" }),
        },
      },
    ),

    isModified ? kyc.save() : Promise.resolve(),
  ]);

  return kyc;
};