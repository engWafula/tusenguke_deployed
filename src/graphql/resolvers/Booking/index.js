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
exports.BookingResolver = void 0;
const mongodb_1 = require("mongodb");
const utils_1 = require("../../../lib/utils");
const api_1 = require("../../../lib/api");
const resolveBookingsIndex = (bookingsIndex, checkInDate, checkOutDate) => {
    let dateCursor = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    const newBookingsIndex = Object.assign({}, bookingsIndex);
    while (dateCursor <= checkOut) {
        const year = dateCursor.getUTCFullYear();
        const month = dateCursor.getUTCMonth();
        const day = dateCursor.getUTCDate();
        if (!newBookingsIndex[year]) {
            newBookingsIndex[year] = {};
        }
        if (!newBookingsIndex[year][month]) {
            newBookingsIndex[year][month] = {};
        }
        if (!newBookingsIndex[year][month][day]) {
            newBookingsIndex[year][month][day] = true;
        }
        else {
            throw new Error("selected dates can't overlap dates that have already been booked");
        }
        dateCursor = new Date(dateCursor.getTime() + 86400000);
    }
    return newBookingsIndex;
};
exports.BookingResolver = {
    Mutation: {
        createBooking: (_root, { input }, { db, req }) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { id, source, checkIn, checkOut } = input;
                //verfiy a logged in user is making the
                const viewer = yield (0, utils_1.authorize)(db, req);
                if (!viewer) {
                    throw new Error("viewer can't be found.");
                }
                //find the listing the user is trying to book
                const listing = yield db.listings.findOne({
                    _id: new mongodb_1.ObjectId(id),
                });
                if (!listing) {
                    throw new Error("listing can't be found.");
                }
                //check that viewer is not booking their own listing
                if (listing.host === viewer._id) {
                    throw new Error("viewer can't book their own listing.");
                }
                //check that check in is before check out
                const checkInDate = new Date(checkIn);
                const checkOutDate = new Date(checkOut);
                if (checkOutDate < checkInDate) {
                    throw new Error("check out date can't be before check in date.");
                }
                //create a new booking index  the listing being booked
                const bookingsIndex = resolveBookingsIndex(listing.bookingsIndex, checkIn, checkOut);
                //get total price to charge
                const totalPrice = listing.price *
                    ((checkOutDate.getTime() - checkInDate.getTime()) / 86400000 + 1);
                //get user doc of the host  of the listing
                const host = yield db.users.findOne({
                    _id: listing.host,
                });
                if (!host || !host.walletId) {
                    throw new Error("the host either can't be found or is not connected with Stripe.");
                }
                // create stripe charge on behalf of the host
                yield api_1.Stripe.charge(source, totalPrice, host.walletId);
                //insert a new booking in our booking collection
                const insertResult = yield db.bookings.insertOne({
                    _id: new mongodb_1.ObjectId(),
                    listing: listing._id,
                    tenant: viewer._id,
                    checkIn,
                    checkOut,
                });
                const insertedBooking = yield db.bookings.findOne({
                    _id: insertResult.insertedId,
                });
                // update the booking field of the tenant
                yield db.users.updateOne({
                    _id: viewer._id,
                }, {
                    $push: { bookings: insertedBooking === null || insertedBooking === void 0 ? void 0 : insertedBooking._id },
                });
                // update the booking field of the listing document
                yield db.listings.updateOne({
                    _id: listing._id,
                }, {
                    $set: { bookingsIndex },
                    $push: { bookings: insertedBooking === null || insertedBooking === void 0 ? void 0 : insertedBooking._id },
                }),
                    //update the user doc of the host to incerement their income
                    yield db.users.updateOne({
                        _id: host._id,
                    }, {
                        $inc: { income: totalPrice },
                    });
                return insertedBooking;
            }
            catch (error) {
                throw new Error(`Failed to create a booking: ${error}`);
            }
        }),
    },
    Booking: {
        id: (booking) => {
            return booking._id.toString();
        },
        listing: (booking, _args, { db }) => {
            return db.listings.findOne({ _id: booking.listing });
        },
        tenant: (booking, _args, { db }) => {
            return db.users.findOne({ _id: booking.tenant });
        },
    },
};
