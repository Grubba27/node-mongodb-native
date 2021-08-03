import { expectNotType, expectType } from 'tsd';
import { FindCursor, FindOptions, MongoClient, Document } from '../../../../src';
import type { PropExists } from '../../utility_types';

// collection.findX tests
const client = new MongoClient('');
const db = client.db('test');
const collection = db.collection('test.find');

// Locate all the entries using find
collection.find({}).toArray((err, fields) => {
  expectType<Document[] | undefined>(fields);
});

// test with collection type
interface TestModel {
  stringField: string;
  numberField?: number;
  fruitTags: string[];
  readonlyFruitTags: readonly string[];
}

const collectionT = db.collection<TestModel>('testCollection');
await collectionT.find({
  $and: [{ numberField: { $gt: 0 } }, { numberField: { $lt: 100 } }],
  readonlyFruitTags: { $all: ['apple', 'pear'] }
});
expectType<FindCursor<TestModel>>(collectionT.find({}));

await collectionT.findOne(
  {},
  {
    projection: {},
    sort: {}
  }
);

const optionsWithComplexProjection: FindOptions<TestModel> = {
  projection: {
    stringField: { $meta: 'textScore' },
    fruitTags: { $min: 'fruitTags' },
    max: { $max: ['$max', 0] }
  },
  sort: { stringField: -1, text: { $meta: 'textScore' }, notExistingField: -1 }
};

await collectionT.findOne({}, optionsWithComplexProjection);

// test with discriminated union type
interface DUModelEmpty {
  type: 'empty';
}
interface DUModelString {
  type: 'string';
  value: string;
}
type DUModel = DUModelEmpty | DUModelString;
const collectionDU = db.collection<DUModel>('testDU');
const duValue = await collectionDU.findOne({});
if (duValue && duValue.type === 'string') {
  // we can still narrow the result
  // permitting fetching other keys that haven't been asserted in the if stmt
  expectType<string>(duValue.value);
}

// collection.findX<T>() generic tests
interface Bag {
  cost: number;
  color: string;
}

const collectionBag = db.collection<Bag>('bag');

const cursor: FindCursor<Bag> = collectionBag.find({ color: 'black' });

cursor.toArray((err, bags) => {
  expectType<Bag[] | undefined>(bags);
});

cursor.forEach(
  bag => {
    expectType<Bag>(bag);
  },
  () => {
    return null;
  }
);

expectType<Bag | undefined>(
  await collectionBag.findOne({ color: 'red' }, { projection: { cost: 1 } })
);

const overrideFind = await collectionBag.findOne<{ cost: number }>(
  { color: 'white' },
  { projection: { cost: 1 } }
);
expectType<PropExists<typeof overrideFind, 'color'>>(false);

// Overriding findOne, makes the return that exact type
expectType<{ cost: number } | undefined>(
  await collectionBag.findOne<{ cost: number }>({ color: 'red' }, { projection: { cost: 1 } })
);

interface Car {
  make: string;
}
interface House {
  windows: number;
}

const car = db.collection<Car>('car');

expectNotType<House | undefined>(await car.findOne({}));

interface Car {
  make: string;
}

function printCar(car: Car | undefined) {
  console.log(car ? `A car of ${car.make} make` : 'No car');
}

const options: FindOptions<Car> = {};
const optionsWithProjection: FindOptions<Car> = {
  projection: {
    make: 1
  }
};

expectNotType<FindOptions<Car>>({
  projection: {
    make: 'invalid'
  }
});

printCar(await car.findOne({}, options));
printCar(await car.findOne({}, optionsWithProjection));

// Readonly tests -- NODE-3452
const colorCollection = client.db('test_db').collection<{ color: string }>('test_collection');
const colorsFreeze: ReadonlyArray<string> = Object.freeze(['blue', 'red']);
const colorsWritable: Array<string> = ['blue', 'red'];

// Permitted Readonly fields
expectType<FindCursor<{ color: string }>>(colorCollection.find({ color: { $in: colorsFreeze } }));
expectType<FindCursor<{ color: string }>>(colorCollection.find({ color: { $in: colorsWritable } }));
expectType<FindCursor<{ color: string }>>(colorCollection.find({ color: { $nin: colorsFreeze } }));
expectType<FindCursor<{ color: string }>>(
  colorCollection.find({ color: { $nin: colorsWritable } })
);
// $all and $elemMatch works against single fields (it's just redundant)
expectType<FindCursor<{ color: string }>>(colorCollection.find({ color: { $all: colorsFreeze } }));
expectType<FindCursor<{ color: string }>>(
  colorCollection.find({ color: { $all: colorsWritable } })
);
expectType<FindCursor<{ color: string }>>(
  colorCollection.find({ color: { $elemMatch: colorsFreeze } })
);
expectType<FindCursor<{ color: string }>>(
  colorCollection.find({ color: { $elemMatch: colorsWritable } })
);

const countCollection = client.db('test_db').collection<{ count: number }>('test_collection');
expectType<FindCursor<{ count: number }>>(
  countCollection.find({ count: { $bitsAnySet: Object.freeze([1, 0, 1]) } })
);
expectType<FindCursor<{ count: number }>>(
  countCollection.find({ count: { $bitsAnySet: [1, 0, 1] as number[] } })
);

const listsCollection = client.db('test_db').collection<{ lists: string[] }>('test_collection');
await listsCollection.updateOne({}, { list: { $pullAll: Object.freeze(['one', 'two']) } });
expectType<FindCursor<{ lists: string[] }>>(listsCollection.find({ lists: { $size: 1 } }));

const rdOnlyListsCollection = client
  .db('test_db')
  .collection<{ lists: ReadonlyArray<string> }>('test_collection');
expectType<FindCursor<{ lists: ReadonlyArray<string> }>>(
  rdOnlyListsCollection.find({ lists: { $size: 1 } })
);

// Before NODE-3452's fix we would get this strange result that included the filter shape joined with the actual schema
expectNotType<FindCursor<{ color: string | { $in: ReadonlyArray<string> } }>>(
  colorCollection.find({ color: { $in: colorsFreeze } })
);

// This is related to another bug that will be fixed in NODE-3454
expectType<FindCursor<{ color: { $in: number } }>>(colorCollection.find({ color: { $in: 3 } }));

// When you use the override, $in doesn't permit readonly
colorCollection.find<{ color: string }>({ color: { $in: colorsFreeze } });
colorCollection.find<{ color: string }>({ color: { $in: ['regularArray'] } });