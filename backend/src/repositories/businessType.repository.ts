import { db } from "../db/index.js";

export const businessTypeRepository = {
  //get all business types
  async getBusinessTypes() {
    return db.businessType.findMany({
        select:{id:true,name:true}
    });
  }
};