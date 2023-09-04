# Schema data loader
`schema-data-loader` lets you create object based requests for loading data from a drupal server with json:api enabled.

## Installation

This package uses as `peerDependency` both `class-transformer` and `reflect-metadata`, so you must have them installed.

```shell
yarn add schema-data-loader class-transformer reflect-metadata
```

## Usage

First we should define our data schema that we will be fetching, more or
less like GraphQL but with TypeScript classes.

So let's imagine that for a given drupal json:api we will receive this response,
here we care about the `data` property object.

```json
{
  "jsonapi": {
    "version": "1.0",
    "meta": {
      "links": {
        "self": {
          "href": "http://jsonapi.org/format/1.0/"
        }
      }
    },
    "parsed": true
  },
  "data": {
    "type": "node--foo",
    "id": "1",
    "links": {
      "self": {
        "href": "https://somecoolurl.com/jsonapi/node/foo/1/"
      }
    },
    "title": "Lorem ipsum",
    "subtitle": "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    "bar": {
      "type": "bar--bar",
      "id": "13",
      "meta": {
        "drupal_internal__target_id": 51
      }
    },
    "baz": [
      {
        "type": "paragraph--baz_big",
        "id": "4",
        "meta": {
          "target_revision_id": 1231,
          "drupal_internal__target_id": 41231
        }
      },
      {
        "type": "paragraph--baz",
        "id": "5",
        "meta": {
          "target_revision_id": 1231,
          "drupal_internal__target_id": 5132
        }
      }
    ],
    "foobar": {
      "type": "paragraph--foobar",
      "id": "7",
      "meta": {
        "target_revision_id": 132,
        "drupal_internal__target_id": 153
      }
    }
  }
}
```

From this data object you would like to retrieve the following properties: `title`,
`subtitle` and `foobar`. Two are `strings` and the last one it's, what we will call from now on,
an **Entity**.

If we would simple use `class-transformer` to map our ts class with the incoming
object from the data source we could easily map `title` and `subtitle` but no
`foobar` because its data has to first be fetched.

To solve this we created the decorator: `@Entity`. This decorator it's in charge of
adding the corresponding metadata so the package it's able to request first the missing data object
and then transform it to the corresponding class type.

So the TypeScript schema class would look something like this:

```typescript
class Foo {
  @Expose()
  title!: string;
  @Expose()
  subtitle!: string;
  
  @Type(() => FooBar)
  @Entity()
  foobar: FooBar;
}

class FooBar {
  @Expose()
  description: string;
  @Expose()
  amount: number
}
```

This schema also uses the `@Type` decorator, that thanks to `class-transformer`
it's able to assign the corresponding class type to the incoming entity data.
Also, `schema-data-loader` uses this decorator too and its metadata, so it's **important**
to always use it when dealing with custom types that are not primitive ones.

Once we have our schema done we can retrieve the data using the `EntityResolverService`
and passing as argument a http client that implements the interface
`IHttpClient`. This snippet shows and example using axios, but you could use any
http client you want.

```typescript
class HttpClient implements IHttpClient {
  private axios: AxiosInstance;

  constructor() {
    this.axios = axios.create({
      baseURL: "https://coolurl.com/jsonapi",
    });
  }

  async get<D = any>(url: string, params?: Record<string, unknown>): Promise<D> {
    return (await this.axios.get(url, { params })).data.data;
  }
}

async function run() {
  // Initial data it's a previously fetched data like the one in the previous json
  // and in general its data of node type, because in drupal it's a parent entity
  const intialData = {...}
  const httpClient = new HttpClient();
  const resolverService = new EntityResolverService(httpClient);
  const foo = await resolverService.get(Foo, intialData);
  console.log(foo.foobar.description) // should log the correspidng value for it's nested entity
}
```

### Working with unions
In some cases you would one property that can be from different kind of types,
that's what's called [union types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#union-types)
in TypeScript.
As well as we have to decorate a nested object with the `@Type` decorator we should also do it
for properties that are unions, either if they are entities or not.
This package uses the `subTypes` metadata given by the `@Type` decorator
to resolve possible entities of multiple types.
An example of working with unions can be shown with the previous json and the property `baz`.

```typescript
// Following the previous schema we will add the baz property to it
class Foo {
  @Expose()
  title!: string;
  @Expose()
  subtitle!: string;

  @Type(() => FooBar)
  @Entity()
  @Expose()
  foobar: FooBar;
  
  // The Union object it's a given util by this package that creates an empty
  // object because we don't know which will be the default type in the incoming data
  @Type(() => Union, {
    discriminator: {
      property: "type",
      subTypes: [
        { value: BazBig, name: "paragraph--baz_big" },
        { value: Baz, name: "paragraph--baz" },
      ]
    }
  })
  @Entity()
  @Expose()
  baz: Array<BazBig | Baz>
}

class BazBig {
  @Expose()
  pictureBig: string;
  @Expose()
  titleBig: string;
}

class Baz {
  @Expose()
  picture: string;
  @Expose()
  title: string;
}
```

As you can see we are using the `type` property inside our entity
as discriminator in the `@Type` decorator to distinguish which object will be which type.
This applies too for union objects properties, you can find more info [here](https://github.com/typestack/class-transformer#providing-more-than-one-type-option).

>**Reminder:** `@Type` decorator its needed by both `class-transformer` and
> `schema-data-loader` so use it when working with Union or types that are not primitives.

### Exposing properties and using different property names
It's common that the consumer of the data might have objects with fewer properties 
and with different names or casing. That's why **it's mandatory** to use `class-trasnformer`
[`@Expose` decorator](https://github.com/typestack/class-transformer#exposing-properties-with-different-names),
to either show a property when transforming it from incoming data or to change its name.
This is because our package when transforming the incoming data uses the `{ excludeExtraneousValues: true }` option
to avoid exposing properties to the consumer that are not declared in their schema classes.

Because some objects are too big, having multiple `@Expose` decorators
can be tedious, so in this package we created a decorator call `@ExposeAll`, which
does the obvious. Exposes all properties in the ts class and also gives the property
the opportunity to change their casing, for example to `snake_case` if the incoming data has the same name
properties but with another casing.

**BUT** there is a caveat, for this decorator to work each ts class property
**must have a default value** either `null` or from its corresponding type.

Here is the previous example re-written with `@ExposeAll`:

```typescript
@ExposeAll()
class Foo {
  title = "";
  subtitle = "";

  @Type(() => FooBar)
  @Entity()
  foobar: FooBar = null;
  
  @Type(() => Union, {
    discriminator: {
      property: "type",
      subTypes: [
        { value: BazBig, name: "paragraph--baz_big" },
        { value: Baz, name: "paragraph--baz" },
      ]
    }
  })
  @Entity()
  baz: Array<BazBig | Baz> = []
}

@ExposeAll({ nameCasing: "snakeCase" })
class BazBig {
  pictureBig = "";
  titleBig = "";
}

@ExposeAll()
class Baz {
  picture = "";
  title = "";
}
```

As you can see it's much cleaner and easier to read. 
