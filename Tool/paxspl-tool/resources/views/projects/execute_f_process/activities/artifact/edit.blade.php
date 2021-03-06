@extends('projects.app')

@section('content')
<div class="row">
    <div class="col-lg-12 margin-tb">
        <div class="pull-left">
            <h2>Add New Artifact</h2>
        </div>

    </div>
</div>

@if ($errors->any())
<div class="alert alert-danger">
    There were some problems with your input.<br><br>
    <ul>
        @foreach ($errors->all() as $error)
        <li>{{ $error }}</li>
        @endforeach
    </ul>
</div>
@endif

<form action="{{ route('projects.execute_f_process.activities.artifact.update', ['project'=>$project -> id,'execute_f_process'=>$execute_f_process -> id,'activity'=>$activity -> id,'artifact'=>$artifact -> id]) }}" method="POST">
    @csrf
    @method('PUT')
    <div class="row">
        <div class="col-xs-6 col-sm-6 col-md-6">
            <div class="form-group">
                <strong>Name:</strong>
                <input type="text" name="name" class="form-control" placeholder="Artifact Name" value="{{ $artifact->artifact->name }}" required maxlength="100">
            </div>
        </div>
        <div class="col-xs-3 col-sm-3 col-md-3">
            <div class="form-group">
                <strong>Artifact Type:</strong>
                <select class="custom-select" name="type" value='{{$artifact->artifact->type}}'>

                    <option value="Domain" {{ $artifact->artifact->type == 'Domain' ? 'selected="selected"' : '' }}>Domain</option>
                    <option value="Requirements" {{ $artifact->artifact->type == 'Requirements' ? 'selected="selected"' : '' }}>Requirements</option>
                    <option value="Design" {{ $artifact->artifact->type == 'Design' ? 'selected="selected"' : '' }}>Design</option>
                    <option value="Architecture" {{ $artifact->artifact->type == 'Architecture' ? 'selected="selected"' : '' }}>Architecture</option>
                    <option value="Development" {{ $artifact->artifact->type == 'Development' ? 'selected="selected"' : '' }}>Development</option>
                    <option value="Technological" {{ $artifact->artifact->type == 'Technological' ? 'selected="selected"' : '' }}>Technological</option>
                </select>
            </div>

        </div>


        <div class="col-xs-6 col-sm-6 col-md-6">
            <div class="form-group">
                <strong>Link to Artifact:</strong>
                <input type="text" name="external_link" class="form-control" placeholder="Link to Artifact" value="{{ $artifact->artifact->external_link }}" required maxlength="100">
            </div>
        </div>
        <div class="col-xs-3 col-sm-3 col-md-3">
            <div class="form-group">
                <strong>File extension:</strong>
                <input type="text" name="extension" class="form-control" placeholder="File Extension (pdf, doc, xml, etc)" value="{{ $artifact->artifact->extension }}" required maxlength="100">
            </div>
        </div>

        <div class="col-xs-9 col-sm-9 col-md-9">
            <div class="form-group">
                <strong>Description:</strong>
                <textarea class="form-control" style="height:150px" name="description" placeholder="Description" required maxlength="500">{{ $artifact->artifact->description }}</textarea>
            </div>
        </div>
        <input type="hidden" id="project_id" name="project_id" value=" {{ $artifact->artifact->project_id }}">
        <input type="hidden" id="owner_id" name="owner_id" value=" {{ $artifact->artifact->owner_id }}">



        <div class="col-xs-9 col-sm-9 col-md-9 text-center">
            <button type="submit" class="btn btn-primary">Update <i class="fas fa-save"></i></button>
        </div>
    </div>

</form>
@endsection