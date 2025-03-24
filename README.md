# barea.js
barea.js (Basic Reactivity) is a small reactive java script heavy influenced by vue.js and angular.js (before they became huge frameworks).
No dependencies just raw reactivity. Good for SPA:s or just to space up the client of your server rendered site.

# What about it

* Using proxies to react on data changes, like vue3
* Fast
* No dependencies to other libs
* Computed properties with automatic dependency tracking
* UI dependency tracking that only update/rerender UI elements when needed
* Templates
* State tracking
* and more...

# Install
```
npm install barea.js
```
# Live Demo
 [Live Demo](https://jfdomitor.github.io/Demo/)
 
# Setup

```
<div id="app"> 
<!-- Your app markup -->
<!-- see examples/stateful/index.html for a clean working CRUD example -->
</div>


<script type="module">

   
    import {BareaApp,BareaViewState,BareaDataModel,BareaHelper} from '/barea.js';

    //Just for debugging
    //BareaHelper.printDebugLogs();
    //BareaHelper.enableDebugLog(10);

    //Barea app element
     const appElement = document.getElementById("app");

    //Createa a data model and database helper
    let db = new BareaDataModel("customer");
    db.addDbIntegerColumn('id',true);
    db.addDbStringColumn('customerName');
    db.addDbStringColumn('customerPhone');
    db.useBareaLocalStorageDb();

    //Statemanagement (Optional, but easiest)
    const state = new BareaViewState(appElement, db, true);

    let currentView=null;

    const appcontent = {
        data:{model:{}},
        methods:{
            saveApplication: function()
            {
                let data = this.getData();
                let editobj = data.model[db.DbTableName];
                if (editobj.id)
                    db.updateEntity(editobj);
                else
                    db.createEntity(editobj);

                //After save, go back to the list
                state.setStateAndNavigate("/Customers/List", "", true);
            },
            editApplication: function(event,element,data,path)
            {
                state.setStateAndNavigate(path, data.id);
            },
            deleteApplication: function(event,element,data)
            {
                db.deleteEntity(data.id);
                state.setStateAndNavigate(state.CurrentState.currentPath, "",true);
            }
        },
        computed:{},
        mounted: function(data) {}
    };

      
    //Get the data model on page load
    appcontent.data.model = db.getBareaDataModel();

   state.onChange(()=>
   {
        //Determine app/view from path
        if (state.CurrentView)
        {
             //Create Barea App (On state change or loaded page)
            const app = new BareaApp();
           
            //Render the view from the model
            state.CurrentView.render();

            //Optional but useful if you would like to present info that belons to the view itself
            appcontent.data.viewInfo = state.CurrentView.getViewDescription();

            //The listview is the primary view in this example
            if (state.CurrentView &&  appcontent.data.viewInfo.islistview)
            {
                appcontent.data.model.entityList = db.getEntities();
            }
            else if (state.CurrentView && state.CurrentView.IsPersistedEntityView && state.EntityId)
            {
                //Typical edit mode, when an id of the data to present is feteched from the path
                appcontent.data.model[db.DbTableName] = db.getEntity(state.EntityId);
            }
            else if (state.CurrentView && appcontent.data.viewInfo.isnewentityview)
            {
                //Typical edit mode, when an id of the data to present is feteched from the path
                appcontent.data.model[db.DbTableName] = {};
            }

            //Bind the datamodel with the UI
            let bareadata = app.mount(appElement, appcontent); 

        }

    });

    //Init state
    state.init();

</script>
```

# Templates
Define your templates directly on the page you're working with.
One template can be assigned to multiple views
```
 <!-- A template defining a header card for the views -->

            <template>
                <view id="new" path="/Customers/Create">
                    <title>Register a new customer</title>
                    <description>Use this view to register a new customer</description>
                    <data isNewEntityView="true" />
                </view>
                <view id="edit" path="/Customers/Edit/:ID">
                    <title>Edit customer</title>
                    <description>Use this view to edit a customer</description>
                </view>
                <view id="list" path="/Customers/List">
                    <title>Customer List</title>
                    <description>This view lists registered customers</description>
                    <data isListView="true" />
                </view>
                <design>
                    <div class="card">
                        <div class="card-header"><h2>{{root.viewInfo.title}}</h2></div>
                        <div class="card-body">
                            <p>{{root.viewInfo.description}}</p>
                            <ul class="nav" ba-if="root.viewInfo.islistview">
                                <li class="nav-item">
                                    <a class="btn btn-primary btn-sm" tabindex="-1" role="button" href="/Customers/Create" style="margin:5px">Create New</a>
                                </li>
                            </ul>
                            <ul class="nav" ba-if="!root.viewInfo.islistview">
                                <li class="nav-item">
                                    <button class="btn btn-primary btn-sm" tabindex="-1" role="button" ba-click="saveApplication()" style="margin:5px">Save</button>
                                </li>
                            </ul>
                        </div>
                    </div>
                </design>
            </template>
           
```

* Directive: ba-bind
```
<input type="text" ba-bind="root.model.user.firstname">
Bind ui controls to a single value in the model
```
* Directive: ba-bind-handler
```
<input type="text" ba-bind="root.model.somedata" ba-bind-handler="someDataHandler()">
Override binding logic for complex ui controls, by implementing a function that updates data/ui when the bound value changes.
```
* Directive: ba-click
```
<button ba-click="saveMyData('arg1', 'arg2')" ba-path="root.model">
Run functions that do some fun
```
* Directive: ba-foreach
```
<tr ba-foreach="show in root.model.shows">
  <td><input type="text" ba-bind="show.Note"></td>
</tr>
A template directive to create new html based on an array in your model, works only on arrays in your model
or computed properties that returns an array
```
* Directive: ba-class
```
<div ba-class="root.settings.myDivClasses" ></div>
Set class names in your data and have them reflected in the dom.
```
* Directive: ba-class-if
```
<div ba-class-if="root.somevalue==='hey ho'?class1,class2,class3" ></div>
<div ba-class-if="someComputedProperty?class1,class2,class3" ></div>
Set class names in your data based on computed properties or expressions and have them reflected in the dom.
```
* Directive: ba-hide
```
<p ba-hide="root.model.somevalue" ></p>
Show / Hide an element based on an expression

<div ba-hide="someComputedProperty" ></div>
Show / Hide an element based on a computed property
```
* Directive: ba-show
```
<p ba-show="root.model.somevalue" ></p>
Show / Hide an element based on an expression

<div ba-show="someComputedProperty" ></div>
Show / Hide an element based on a computed property
```
* Directive: ba-if
```
<p ba-if="root.showText" ></p>
Add / Remove elements based on an expression

<div ba-if="showText" ></div>
Add / Remove elements based on a computed property
```
* Directive: ba-src
```
Show images based on urls in your model
```
* Directive: ba-path
```
Use this together with handlers (ba-if, ba-show etc..) to have data at a certain path sent as an event parameter
```
* Directive: ba-href
```
Use this to set the href attribute from your data
```
* Interpolation
```
Examples:
{{root.model}}, {{root.model.array}}, {{root.model.somevalue}}
```
* Check out the file examples/index.html
```
Tip: run examples/index.html with vs code live server to explore all directives and functions
```

# In Depth (Key Factors)

* Operates only on the app node where Barea.js is mounted.
* Proxies objects on get, ensuring that all mounted objects are always proxied.
* UI Dependency Tracking: Directive objects are created, linked to both data and DOM elements, and stored in a UIDependencyTracker, which is notified when data changes. This ensures that only the relevant dom elements are updated on data change.
* Computed Property Dependency Tracking: Tracking is based on the principle path (e.g., root.model.users.user), meaning a computed property is linked to all paths involved in calculating its value. If a directive uses a computed property, its directive object will also be linked to the computed property. This ensures that all related directives update when the property becomes dirty (i.e., needs recalculation). Only changes to data will trigger a dependent computed property. An array function cannot be the trigger, this is by design. Also rememeber to never edit data inside a computed property, since it might trigger an infinity loop.
  
Example:
Works fine, nothing edited here
```
fullName: function()
{
  let model = this.getData();
  return model.firstName + '  ' + model.lastName;
}
```
* Expressions: For the directives: **ba-if, ba-class-if, ba-hide and ba-show** it's possible to register either an expression or a predifined computed property function. All expressions are converted into computed properties by running a dynamicly created function that acts as the getter of the computed property.
* Templates: When rendering a template, new markup is generated, and these elements are added to both UI Dependency Tracking and Computed Property Dependency Tracking, just as during initial mounting. The generated markup is then managed in the same way as initially loaded data.
* Avoid declaring too many computed functions or expressions directly in template markup, as this can significantly impact performance. If you load 1,000 rows, each containing multiple expressions or computed functions, the system may have to evaluate up to:
1,000 × (number of expressions or functions per row). This can cause unnecessary re-renders and slow down the application.

Example Scenario:
Consider a template where each item conditionally displays data using a computed function or expression:

```
<div ba-show="root.edit">
    <!-- Template content -->
</div>
```
If root.edit is used in every template item, the function or expression linked to it will evaluate 1,000 times—once for each row, but will only execute the getter the computed propery the first time.

