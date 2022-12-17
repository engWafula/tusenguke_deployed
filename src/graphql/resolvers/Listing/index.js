"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListingResolver = void 0;
const types_1 = require("../../../lib/types");
const types_2 = require("./types");
const mongodb_1 = require("mongodb");
const utils_1 = require("../../../lib/utils");
const api_1 = require("../../../lib/api");
const verifyHostListingInput = (input) => {
    const { title, description, type, price } = input;
    if (title.length > 100) {
        throw new Error("listing title must be under 100 characters.");
    }
    if (description.length > 5000) {
        throw new Error("listing description must be under 5000 characters.");
    }
    if (type !== types_1.ListingType.Commercial && type !== types_1.ListingType.Residential) {
        throw new Error("Listing type must be either apartment or house.");
    }
    if (price < 0) {
        throw new Error("Price must be greater than 0.");
    }
};
exports.ListingResolver = {
    Mutation: {
        hostListing: (_root, { input }, { db, req }) => __awaiter(void 0, void 0, void 0, function* () {
            verifyHostListingInput(input);
            const viewer = yield (0, utils_1.authorize)(db, req);
            if (!viewer) {
                throw new Error("viewer can't be found.");
            }
            const { country, admin, city } = yield api_1.Google.geocode(input.address);
            if (!country || !admin || !city) {
                throw new Error("invalid address input...");
            }
            const imageUrl = yield api_1.Cloudinary.upload(input.image);
            const insertResult = yield db.listings.insertOne(Object.assign(Object.assign({ _id: new mongodb_1.ObjectId() }, input), { bookings: [], bookingsIndex: {}, country,
                admin,
                city, host: viewer._id, image: imageUrl }));
            const insertedListing = yield db.listings.findOne({ _id: insertResult.insertedId });
            yield db.users.updateOne({ _id: viewer._id }, {
                $push: {
                    listings: insertedListing === null || insertedListing === void 0 ? void 0 : insertedListing._id
                }
            });
            return insertedListing;
        })
    },
    Query: {
        listing: (_root, { id }, { db, req }) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const listing = yield db.listings.findOne({ _id: new mongodb_1.ObjectId(id) });
                if (!listing) {
                    throw new Error("no listing found");
                }
                const viewer = yield (0, utils_1.authorize)(db, req);
                if (viewer && (viewer === null || viewer === void 0 ? void 0 : viewer._id) === listing.host) {
                    listing.authorized = true;
                }
                return listing;
            }
            catch (error) {
                throw new Error(`Failed to query listing: ${error}`);
            }
        }),
        listings: (_root, { location, filter, limit, page }, { db }) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const query = {};
                const data = {
                    region: null,
                    total: 0,
                    result: [],
                };
                if (location) {
                    const { country, city, admin } = yield api_1.Google.geocode(location);
                    if (city)
                        query.city = city;
                    if (admin)
                        query.admin = admin;
                    if (country) {
                        query.country = country;
                    }
                    else {
                        throw new Error("No country found");
                    }
                    const cityText = city ? `${city}, ` : "";
                    const adminText = admin ? `${admin}, ` : "";
                    data.region = `${cityText}${adminText}${country}`;
                }
                let cursor = yield db.listings.find(query);
                if (filter && filter === types_2.ListingsFilter.PRICE_LOW_TO_HIGH) {
                    cursor = cursor.sort({
                        price: 1,
                    });
                }
                if (filter && filter === types_2.ListingsFilter.PRICE_HIGH_TO_LOW) {
                    cursor = cursor.sort({
                        price: -1,
                    });
                }
                cursor = cursor.skip(page > 0 ? (page - 1) * limit : 0);
                cursor = cursor.limit(limit);
                data.total = yield cursor.count();
                data.result = yield cursor.toArray();
                return data;
            }
            catch (error) {
                throw new Error(`Failed to query  listings: ${error}`);
            }
        }),
    },
    Listing: {
        id: (listing) => {
            return listing._id.toString();
        },
        host: (listing, _args, { db }) => __awaiter(void 0, void 0, void 0, function* () {
            const host = yield db.users.findOne({ _id: listing.host });
            if (!host) {
                throw new Error("no host found");
            }
            return host;
        }),
        bookingsIndex: (listing) => {
            return JSON.stringify(listing.bookingsIndex);
        },
        bookings: ({ authorized, bookings }, { limit, page }, { db }) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                if (!authorized) {
                    return null;
                }
                const data = {
                    total: 0,
                    result: [],
                };
                let cursor = db.bookings.find({ _id: { $in: bookings } });
                cursor.skip(page > 0 ? (page - 1) * limit : 0).limit(limit);
                data.total = yield cursor.count();
                data.result = yield cursor.toArray();
                return data;
            }
            catch (error) {
                throw new Error(`Failed to query listing's bookings: ${error}`);
            }
        }),
    },
};
